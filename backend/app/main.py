"""TerraGuard AI — FastAPI backend.

Run:  .venv/Scripts/python -m uvicorn app.main:app --port 8010 --reload
"""
from __future__ import annotations

from fastapi import FastAPI, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

from . import db, geospatial, earth_engine
from .ai import service as ai
from .ai.providers import grafilab_ready, openai_model, openai_ready
from .schemas import (ActionRequest, ActionResponse, ExplainRequest, FieldBriefRequest, IncidentsResponse,
                      PredictRequest, PredictResponse, SimulateRequest, SimulateResponse)
from .service import store
from .operational_store import OperationalStoreError

app = FastAPI(title="TerraGuard AI", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
                   allow_methods=["*"], allow_headers=["*"])


@app.exception_handler(OperationalStoreError)
async def operational_error(_request, _exc):
    return JSONResponse(status_code=503, content={"detail": "Operational records are unavailable. Please try again."})


@app.on_event("startup")
def _startup() -> None:
    store()


def _known(incident_id: str) -> None:
    if incident_id not in store().inc_index:
        raise HTTPException(404, f"Unknown incident {incident_id}")


@app.get("/api/health")
def health():
    s = store()
    result = {"status": "ok", "model": s.bundle["version"], "served_model": s.bundle["chosen"],
            "data_source": s.prov["source"], "is_synthetic": s.prov["is_synthetic"],
            "providers": {"openai": openai_ready(), "openai_model": openai_model() if openai_ready() else None,
                          "grafilab": grafilab_ready()},
            "earth_engine": geospatial._gee() is not None}
    try:
        db.check_ready()
    except OperationalStoreError:
        result.update(status="degraded", operational_database={"status": "unavailable"})
        return JSONResponse(status_code=503, content=result)
    result["operational_database"] = {"status": "ready"}
    return result


@app.get("/api/incidents", response_model=IncidentsResponse)
def incidents(scenario: str | None = None):
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


@app.post("/api/incidents/{incident_id}/action", response_model=ActionResponse)
def action(incident_id: str, req: ActionRequest):
    _known(incident_id)
    if req.action == "DISMISS" and not (req.reason and req.reason.strip()):
        raise HTTPException(422, "Dismissing an incident requires a reason.")
    s = store()
    scenario, _ = s.inc_index[incident_id]
    rec = s.predict(incident_id, req.teams)["priority"]["recommendation"]
    row = db.record_action(scenario["scenario_id"], incident_id, req.action, req.reason, rec, req.team_name)
    return {"action": row, "incident_status": db.STATUS_TEXT[req.action]}


@app.get("/api/actions")
def actions():
    return {"actions": db.list_actions()}


@app.get("/api/evaluation")
def evaluation():
    s = store()
    return {"provenance": s.prov, "audit": s.audit, "policy_backtest": s.backtest, **s.evaluation}


@app.get("/api/geospatial/{incident_id}")
def geo(incident_id: str):
    _known(incident_id)
    return geospatial.context(store().incident(incident_id, statuses={}))


@app.get("/api/earth-engine")
def earth_engine_status():
    return earth_engine.service().status()


@app.get("/api/earth-engine/tiles/{handle}/{z}/{x}/{y}")
def earth_engine_tile(handle: str, z: int, x: int, y: int):
    service = earth_engine.service()
    try:
        url = service.tile_url(handle, z, x, y)
    except KeyError:
        raise HTTPException(410, "Satellite layer expired. Refresh the imagery.")
    except ValueError:
        raise HTTPException(422, "Invalid tile coordinates.")
    try:
        image = service.fetch_tile(handle, z, x, y)
    except Exception:
        raise HTTPException(503, "Satellite tile is unavailable. Refresh the imagery.")
    # Earth Engine can optimize an opaque RGB tile as JPEG.
    if image.startswith(b'\x89PNG\r\n\x1a\n'):
        mime = 'image/png'
    elif image.startswith(b'\xff\xd8\xff'):
        mime = 'image/jpeg'
    else:
        raise HTTPException(503, "Satellite tile is unavailable. Refresh the imagery.")
    return Response(content=image, media_type=mime, headers={"Cache-Control": "private, max-age=300"})


@app.get("/api/earth-engine/{incident_id}")
def earth_engine_imagery(incident_id: str, days: int = Query(30, ge=14, le=60), refresh: bool = False,
                         bbox: str | None = None, mode: str = "context"):
    _known(incident_id)
    if days not in (14, 30, 60):
        raise HTTPException(422, "Choose a 14, 30 or 60 day window.")
    # Imagery remains available even if operational storage is down.
    incident = store().incident(incident_id, statuses={})
    try:
        return earth_engine.service().describe(incident, days, refresh, bbox=bbox, mode=mode)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from None


@app.post("/api/ai/explain")
async def explain(req: ExplainRequest):
    _known(req.incident_id)
    return await run_in_threadpool(ai.explain, store(), req.incident_id, req.teams, req.simulation)


@app.post("/api/ai/field-brief")
async def field_brief(req: FieldBriefRequest):
    _known(req.incident_id)
    return await run_in_threadpool(ai.field_brief, store(), req.incident_id, req.teams, req.action_id)
