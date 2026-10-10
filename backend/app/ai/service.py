"""Orchestrates grounded LLM briefings: build evidence -> call provider -> validate -> retry -> fallback.

Provider use is always reported (provider, model, status, validation notes). Providers are never switched
silently, and nothing here can alter predictions, rankings or simulation results.
"""
from __future__ import annotations

import json
import time
from collections import defaultdict, deque

from .. import db, records
from ..evidence import build_package, package_hash
from . import fallback
from .providers import (BRIEFING_SCHEMA, FIELD_BRIEF_SCHEMA, ProviderError, call_grafilab, call_openai,
                        grafilab_ready, openai_ready)
from .validate import validate_briefing, validate_field_brief

RULES = """You explain decision-support outputs for forest-fire coordinators in Malaysia and Indonesia.
Hard rules:
- Use ONLY facts in the evidence package. Cite the evidence_id of every fact you use.
- Never invent observations, numbers, places or times. Only use numbers that appear in the evidence.
- Never create or change probabilities, priority scores, rankings or the recommendation.
- Never claim or imply illegal activity, arson, slash-and-burn or blame. Never order enforcement, dispatch or evacuation.
- The 48-hour probability is about another satellite detection nearby, not fire spread, severity or damage.
- Simulation results are hypothetical scenario comparisons, never a wildfire forecast.
- Use plain English for non-experts. Be concise: 1-3 sentences per section."""

_calls: dict[str, deque] = defaultdict(deque)
RATE_LIMIT = 10  # requests per minute per incident and kind


def _rate_ok(key: str) -> bool:
    q = _calls[key]
    now = time.time()
    while q and now - q[0] > 60:
        q.popleft()
    if len(q) >= RATE_LIMIT:
        return False
    q.append(now)
    return True


def _run(kind: str, pkg: dict, rec: str, primary: str) -> dict:
    """primary: 'openai' (explain) or 'grafilab' (field brief)."""
    h = package_hash(pkg, kind)
    cached = db.cached_brief(pkg["incident_id"], kind, h)
    if cached:
        return {**cached, "cached": True}
    schema, name = (BRIEFING_SCHEMA, "incident_briefing") if kind == "explain" else (FIELD_BRIEF_SCHEMA, "field_brief")
    task = ("Write an incident briefing with sections incident_summary, why_prediction (use the FACTOR facts; they explain "
            "the model estimate only), why_priority (use PRIORITY and SUMMARY facts), comparison_with_next_incident (use "
            "COMPARE facts and RANK_ORDER; never contradict the order), uncertainties (EVID_FLAG, TREE_VARIATION, CALIBRATION; "
            "tree variation is not a confidence interval), what_would_improve_confidence (GAP facts; never promise certainty), "
            "recommended_next_step (repeat the deterministic RECOMMENDATION exactly; do not restate the urgency differently)."
            if kind == "explain" else
            "Write a concise English field-team verification brief. The verification task must match the "
            "deterministic RECOMMENDATION and must not add orders beyond verification. Mark it as a draft for human review.")
    user = f"{task}\n\nEVIDENCE PACKAGE (JSON):\n{json.dumps(pkg, ensure_ascii=False, default=str)}"
    validator = (lambda o: validate_briefing(o, pkg, rec)) if kind == "explain" else (lambda o: validate_field_brief(o, pkg))

    attempts: list[dict] = []
    order = [primary]
    if kind == "explain" and grafilab_ready():
        order.append("grafilab")   # disclosed fallback when OpenAI is unavailable
    for provider in order:
        if provider == "openai" and not openai_ready():
            attempts.append({"provider": "openai", "error": "OPENAI_API_KEY not configured"})
            continue
        if provider == "grafilab" and not grafilab_ready():
            attempts.append({"provider": "grafilab", "error": "GRAFILAB_API_KEY not configured"})
            continue
        if not _rate_ok(f"{pkg['incident_id']}:{kind}:{provider}"):
            attempts.append({"provider": provider, "error": "rate limit (10/min) reached"})
            continue
        prompt = user
        for attempt in range(2):  # one regeneration with the validator's feedback
            try:
                obj, model = (call_openai(RULES, prompt, schema, name) if provider == "openai"
                              else call_grafilab(RULES, prompt, schema))
            except ProviderError as e:
                attempts.append({"provider": provider, "error": str(e)})
                break
            ok, problems = validator(obj)
            attempts.append({"provider": provider, "model": model, "valid": ok is not None, "problems": problems})
            if ok is not None:
                result = {
                    "kind": kind, "incident_id": pkg["incident_id"], "content": ok.model_dump(),
                    "provider": provider, "model": model, "status": "generated",
                    "provider_note": (None if provider == primary else
                                      f"{'Grafilab' if provider == 'grafilab' else 'OpenAI'} used because "
                                      f"{'OpenAI' if primary == 'openai' else 'Grafilab'} was unavailable"),
                    "attempts": attempts, "evidence": pkg["facts"], "evidence_hash": h,
                }
                db.log_brief(pkg["incident_id"], kind, h, provider, model, "generated", result)
                return result
            prompt = user + "\n\nYour previous answer was rejected for these reasons; fix them:\n- " + "\n- ".join(problems[:8])
        if provider == primary and attempts and attempts[-1].get("problems"):
            break  # primary answered but failed validation twice -> deterministic, do not provider-shop
    content = fallback.briefing(pkg, rec) if kind == "explain" else fallback.field_brief(pkg, rec)
    result = {"kind": kind, "incident_id": pkg["incident_id"], "content": content, "provider": "deterministic",
              "model": None, "status": "fallback_deterministic",
              "provider_note": "AI provider unavailable or output failed validation; showing a rule-based explanation.",
              "attempts": attempts, "evidence": pkg["facts"], "evidence_hash": h}
    db.log_brief(pkg["incident_id"], kind, h, None, None, "fallback_deterministic", result)
    return result


def explain(store, incident_id: str, teams: int, simulation: dict | None) -> dict:
    inc = store.incident(incident_id)
    pred = store.predict(incident_id, teams)
    pkg = build_package(inc, pred, teams, simulation)
    return _run("explain", pkg, pred["priority"]["recommendation"], "openai")


def field_brief(store, incident_id: str, teams: int, action_id: int | None, stored_in: str | None = None) -> dict:
    inc = store.incident(incident_id)
    pred = store.predict(incident_id, teams)
    pkg = build_package(inc, pred, teams)
    rec = pred["priority"]["recommendation"]
    if action_id:
        a = records.get().get_action(action_id, stored_in)
        if a and a["incident_id"] == incident_id:
            src = "TerraGuard decision record"
            pkg["facts"].append({"evidence_id": "HUMAN_ACTION", "label": "Coordinator decision",
                                 "value": f"{a['action']} at {a['created_at']}", "unit": None, "source": src})
            if a.get("reason"):
                pkg["facts"].append({"evidence_id": "DECISION_REASON", "label": "Coordinator's reason",
                                     "value": a["reason"], "unit": None, "source": src})
            if a.get("team_name"):
                pkg["facts"].append({"evidence_id": "CREW", "label": "Assigned crew", "value": a["team_name"],
                                     "unit": None, "source": src})
            waiting = a.get("left_waiting") or []
            if waiting:
                pkg["facts"].append({"evidence_id": "LEFT_WAITING", "label": "Incidents left unattended",
                                     "value": "; ".join(f"{w['incident_id']} ({w.get('region')})" for w in waiting),
                                     "unit": None, "source": src})
            rec = {"ASSIGN_INSPECTION": "INSPECT", "REQUEST_RECHECK": "RECHECK"}.get(a["action"], rec)
    return _run("field_brief", pkg, rec, "grafilab")
