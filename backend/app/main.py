"""TerraGuard AI — FastAPI backend.

Run:  .venv/Scripts/python -m uvicorn app.main:app --port 8010 --reload
"""
from __future__ import annotations
import asyncio
import os
import sqlite3
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query, Response as ApiResponse
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

from . import geospatial, records, earth_engine, reports
from .ai import service as ai
from .ai.providers import grafilab_ready, openai_model, openai_ready
from .schemas import (ActionRequest, ActionResponse, ActionsResponse, ExplainRequest, FieldBriefRequest, IncidentsResponse,
                      PredictRequest, PredictResponse, SimulateRequest, SimulateResponse)
from .service import store
from .operational_store import OperationalStoreError

SNAPSHOT_CACHE = "public, s-maxage=300, stale-while-revalidate=3600"
NO_STORE = "no-store"
TILE_CACHE = "public, s-maxage=600, stale-while-revalidate=86400"


def cors_origins() -> list[str]:
    origins = ["http://localhost:3000", "http://127.0.0.1:3000"]
    extra = os.getenv("CORS_ORIGINS", "")
    if extra:
        origins.extend(item.strip() for item in extra.split(",") if item.strip())
    for key in ("VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_BRANCH_URL", "VERCEL_URL"):
        host = os.getenv(key, "").strip()
        if host:
            origins.append(host if host.startswith("http") else f"https://{host}")
    return list(dict.fromkeys(origins))


@asynccontextmanager
async def lifespan(_app):
    store()
    imagery = earth_engine.service()
    try:
        imagery.warm()
    except Exception:
        pass
    try:
        yield
    finally:
        await asyncio.to_thread(imagery.close)
        if hasattr(earth_engine.service, "cache_clear"):
            earth_engine.service.cache_clear()


app = FastAPI(title="TerraGuard AI", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=cors_origins(),
                   allow_methods=["*"], allow_headers=["*"])


@app.exception_handler(OperationalStoreError)
async def operational_error(_request, _exc):
    return JSONResponse(status_code=503, content={"detail": "Operational records are unavailable. Please try again."})


@app.exception_handler(records.RecordError)
async def record_error(_request, exc):
    return JSONResponse(status_code=502, content={"detail": str(exc) or "Decision could not be recorded."})


def _known(incident_id: str) -> None:
    if incident_id not in store().inc_index:
        raise HTTPException(404, f"Unknown incident {incident_id}")


@app.get("/api/health")
def health(response: ApiResponse):
    response.headers["Cache-Control"] = NO_STORE
    s = store()
    record_store = None
    try:
        record_store = records.get()
        rec = record_store.health()
    except (records.RecordError, OperationalStoreError, sqlite3.Error):
        rec = {"backend": record_store.backend if record_store is not None else "unavailable", "available": False}
    result = {"status": "ok", "model": s.bundle["version"], "served_model": s.bundle["chosen"],
            "data_source": s.prov["source"], "is_synthetic": s.prov["is_synthetic"],
            "record_backend": rec["backend"], "supabase": rec,
            "providers": {"openai": openai_ready(), "openai_model": openai_model() if openai_ready() else None,
                          "grafilab": grafilab_ready()},
            "earth_engine": geospatial._gee() is not None}
    if not rec.get("available", True) or rec.get("supabase_reachable") is False:
        result.update(status="degraded", operational_database={"status": "unavailable"})
        return JSONResponse(status_code=503, content=result)
    result["operational_database"] = {"status": "ready"}
    return result


@app.get("/api/incidents", response_model=IncidentsResponse)
def incidents(scenario: str | None = None, response: ApiResponse = None):
    if response is not None:
        response.headers["Cache-Control"] = NO_STORE
    try:
        return store().incidents(scenario)
    except KeyError:
        raise HTTPException(404, f"Unknown scenario {scenario}")


@app.post("/api/predict", response_model=PredictResponse)
def predict(req: PredictRequest):
    _known(req.incident_id)
    return store().predict(req.incident_id, req.teams, req.overrides)


@app.post("/api/simulate", response_model=SimulateResponse)
async def simulate(req: SimulateRequest):
    try:
        return await run_in_threadpool(store().simulate, req)
    except KeyError:
        raise HTTPException(404, f"Unknown scenario {req.scenario_id}")


@app.post("/api/reports/{incident_id}")
async def incident_reports(incident_id: str, req: SimulateRequest | None = None):
    """Prediction Report + Recommendation Report (deterministic; consequences from a matched-seed simulation)."""
    _known(incident_id)
    return await run_in_threadpool(reports.build, store(), incident_id, req)


@app.post("/api/incidents/{incident_id}/action", response_model=ActionResponse)
def action(incident_id: str, req: ActionRequest):
    _known(incident_id)
    if not req.reason.strip():
        raise HTTPException(422, "Every decision needs a reason for the record.")
    try:
        return store().decide(incident_id, req.action, req.reason.strip(), req.teams, req.team_name)
    except records.RecordError as e:
        raise HTTPException(502, f"Decision could not be recorded: {e}")


@app.get("/api/actions", response_model=ActionsResponse)
def actions(scenario: str | None = None, include_archived: bool = False, response: ApiResponse = None):
    if response is not None:
        response.headers["Cache-Control"] = NO_STORE
    return store().actions(scenario, include_archived)


@app.get("/api/evaluation")
def evaluation(response: ApiResponse):
    response.headers["Cache-Control"] = SNAPSHOT_CACHE
    s = store()
    return {"provenance": s.prov, "audit": s.audit, "policy_backtest": s.backtest, **s.evaluation}


@app.get("/api/geospatial/{incident_id}")
def geo(incident_id: str, response: ApiResponse):
    _known(incident_id)
    response.headers["Cache-Control"] = SNAPSHOT_CACHE
    return geospatial.context(store().incident(incident_id, att={}))


@app.get("/api/earth-engine")
def earth_engine_status():
    return earth_engine.service().status()


@app.get("/api/earth-engine/tiles/{handle}/{z}/{x}/{y}")
async def earth_engine_tile(handle: str, z: int, x: int, y: int):
    service = earth_engine.service()
    if not (0 <= z <= 18 and 0 <= x < 2**z and 0 <= y < 2**z):
        raise HTTPException(422, "Invalid tile coordinates.")
    try:
        image = await asyncio.get_running_loop().run_in_executor(service.delivery.tile_io, service.fetch_tile, handle, z, x, y)
    except KeyError:
        raise HTTPException(410, "Satellite layer expired. Refresh the imagery.")
    except Exception:
        raise HTTPException(503, "Satellite tile is unavailable. Refresh the imagery.")
    # Earth Engine can optimize an opaque RGB tile as JPEG.
    if image.startswith(b'\x89PNG\r\n\x1a\n'):
        mime = 'image/png'
    elif image.startswith(b'\xff\xd8\xff'):
        mime = 'image/jpeg'
    else:
        raise HTTPException(503, "Satellite tile is unavailable. Refresh the imagery.")
    return Response(content=image, media_type=mime, headers={"Cache-Control": TILE_CACHE})


@app.get("/api/earth-engine/{incident_id}")
def earth_engine_imagery(incident_id: str, days: int = Query(30, ge=14, le=60), refresh: bool = False,
                         bbox: str | None = None, mode: str = "context", async_load: bool = False):
    _known(incident_id)
    if days not in (14, 30, 60):
        raise HTTPException(422, "Choose a 14, 30 or 60 day window.")
    # Imagery remains available even if operational storage is down.
    incident = store().incident(incident_id, att={})
    try:
        result = earth_engine.service().describe(incident, days, refresh, bbox=bbox, mode=mode, background=async_load)
        return JSONResponse(result, headers={"Cache-Control": "no-store"})
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from None


@app.post("/api/ai/explain")
async def explain(req: ExplainRequest):
    _known(req.incident_id)
    return await run_in_threadpool(ai.explain, store(), req.incident_id, req.teams, req.simulation)


@app.post("/api/ai/field-brief")
async def field_brief(req: FieldBriefRequest):
    _known(req.incident_id)
    return await run_in_threadpool(ai.field_brief, store(), req.incident_id, req.teams, req.action_id, req.stored_in)
