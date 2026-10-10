"""TerraGuard AI — FastAPI backend.

Run:  .venv/Scripts/python -m uvicorn app.main:app --port 8010 --reload
"""
from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import db, geospatial
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
    return geospatial.context(store().incident(incident_id))


@app.post("/api/ai/explain")
async def explain(req: ExplainRequest):
    _known(req.incident_id)
    return await run_in_threadpool(ai.explain, store(), req.incident_id, req.teams, req.simulation)


@app.post("/api/ai/field-brief")
async def field_brief(req: FieldBriefRequest):
    _known(req.incident_id)
    return await run_in_threadpool(ai.field_brief, store(), req.incident_id, req.teams, req.action_id)
