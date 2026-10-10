"""TerraGuard AI — FastAPI backend.

Run:  .venv/Scripts/python -m uvicorn app.main:app --port 8010 --reload
"""
from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware

from . import geospatial, records
from .ai import service as ai
from .ai.providers import grafilab_ready, openai_model, openai_ready
from .schemas import (ActionRequest, ActionResponse, ActionsResponse, ExplainRequest, FieldBriefRequest, IncidentsResponse,
                      PredictRequest, PredictResponse, SimulateRequest, SimulateResponse)
from .service import store

app = FastAPI(title="TerraGuard AI", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
                   allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
def _startup() -> None:
    store()


def _known(incident_id: str) -> None:
    if incident_id not in store().inc_index:
        raise HTTPException(404, f"Unknown incident {incident_id}")


@app.get("/api/health")
def health():
    s = store()
    rec = records.get().health()
    return {"status": "ok", "model": s.bundle["version"], "served_model": s.bundle["chosen"],
            "data_source": s.prov["source"], "is_synthetic": s.prov["is_synthetic"],
            "record_backend": rec["backend"], "supabase": rec,
            "providers": {"openai": openai_ready(), "openai_model": openai_model() if openai_ready() else None,
                          "grafilab": grafilab_ready()},
            "earth_engine": geospatial._gee() is not None}


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
    if not req.reason.strip():
        raise HTTPException(422, "Every decision needs a reason for the record.")
    try:
        return store().decide(incident_id, req.action, req.reason.strip())
    except records.RecordError as e:
        raise HTTPException(502, f"Decision could not be recorded: {e}")


@app.get("/api/actions", response_model=ActionsResponse)
def actions(scenario: str | None = None, include_archived: bool = False):
    return store().actions(scenario, include_archived)


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
    return await run_in_threadpool(ai.field_brief, store(), req.incident_id, req.teams, req.action_id, req.stored_in)
