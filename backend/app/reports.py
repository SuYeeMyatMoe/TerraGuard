"""Prediction Report and Recommendation Report for one incident.

Everything is composed from computed values:
  * prediction, factors, urgency, anomaly pattern, heat signal  -> Store.predict()
  * noise resilience                                            -> 50 perturbed copies through the same model
  * crew feasibility                                            -> app.feasibility (straight-line, jurisdiction)
  * consequences of under- / over-response                      -> matched-seed simulation (hypothetical)
  * false-alarm evidence                                        -> held-out evaluation (evaluation.json)
No LLM is involved. Consequences are hypothetical simulation outputs, not forecasts of real damage.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from ml.features import FEATURE_COLUMNS
from ml.feature_catalog import format_value

from . import feasibility
from .explanations import short
from .schemas import SimulateRequest

ACTION = {
    "SEND_CREW": {"label": "Send crew", "record": "ASSIGN_INSPECTION"},
    "ESCALATE": {"label": "Escalate to local authority", "record": "ESCALATE_COORDINATION"},
    "RECHECK": {"label": "Recheck / verify", "record": "REQUEST_RECHECK"},
    "MONITOR": {"label": "Monitor", "record": "CONTINUE_MONITORING"},
}
NOISE_COLS = {"frp_max": 0.10, "frp_mean": 0.10, "bt4_max": 0.02, "scan_track": 0.10,
              "relative_humidity_2m_min": 0.08, "wind_speed_10m_max": 0.10, "temperature_2m_max": 0.03}


def noise_check(store, candidate_id: str, threshold: float, n: int = 50, seed: int = 0) -> dict:
    """Re-score the incident with simulated sensor/weather noise and report how stable the estimate is."""
    b = store.bundle
    row = store.cand.loc[candidate_id]
    base = row[FEATURE_COLUMNS].astype(float).fillna(b["medians"])
    rng = np.random.default_rng(seed)
    X = np.repeat(base.to_numpy()[None, :], n, axis=0)
    idx = {f: i for i, f in enumerate(FEATURE_COLUMNS)}
    for f, sd in NOISE_COLS.items():
        X[:, idx[f]] *= rng.normal(1.0, sd, n)
    X[:, idx["log_frp_sum"]] += rng.normal(0, 0.1, n)
    for f in ("prior_24h", "prior_72h", "prior_7d"):           # an occasional missed / extra detection
        X[:, idx[f]] = np.maximum(X[:, idx[f]] + rng.choice([-1, 0, 0, 0, 1], n), 0)
    if b["chosen"] != "random_forest":
        return {"available": False}
    p0 = float(b["rf"].predict_proba(base.to_numpy()[None, :])[0, 1])
    ps = b["rf"].predict_proba(X)[:, 1]
    same_side = float(np.mean((ps >= threshold) == (p0 >= threshold)))
    lo, hi = np.percentile(ps, [5, 95])
    stable = same_side >= 0.9 and (hi - lo) <= 0.2
    return {
        "available": True, "samples": n,
        "perturbation": "FRP ±10%, thermal signal ±2%, footprint ±10%, weather ±3–10%, ±1 nearby detection",
        "estimate": round(p0, 4), "range_5_95": [round(float(lo), 4), round(float(hi), 4)],
        "same_side_of_threshold": round(same_side, 3), "stable": bool(stable),
        "text": (f"Across {n} noisy copies, the estimate stayed between {lo * 100:.0f}% and {hi * 100:.0f}% and stayed on the "
                 f"same side of the alert threshold in {same_side * 100:.0f}% of copies."
                 + (" The signal is stable under noise." if stable else " The estimate is sensitive to noise; verify before acting.")),
    }


def _stat(m: dict) -> dict:
    return {"mean": m["mean"], "ci95": m["ci95"]}


def build(store, incident_id: str, req: SimulateRequest | None = None) -> dict:
    pred = store.predict(incident_id, 1)
    inc = store.incident(incident_id, att={})
    scenario, meta = store.inc_index[incident_id]
    others = [c for c in pred["competing"] if c["incident_id"] != incident_id]
    rec = pred["priority"]["recommendation"]
    urg = pred["urgency"]
    feas = feasibility.assess(inc)
    ev = store.evaluation.get("random_forest", {}).get("test", {})
    noise = noise_check(store, meta["candidate_id"], pred["threshold"])

    # ---------------- simulation: crew HERE vs crew elsewhere vs no crew (matched seeds) ----------------
    base_req = req or SimulateRequest()
    sim = store.simulate(base_req.model_copy(update={"scenario_id": scenario["scenario_id"], "coordinator_assignment": incident_id,
                                                     "teams": 1}))
    pi = {p: {x["incident_id"]: x for x in sim["policies"][p]["metrics"]["per_incident"]} for p in sim["policies"]}
    here, none = pi["coordinator"][incident_id], pi["none"][incident_id]
    attended, unattended = here["burned_cells"], none["burned_cells"]
    gain = round(unattended["mean"] - attended["mean"], 2)
    cost = sim["policies"]["coordinator"]["metrics"]["response_cost_rm"]
    hours = sim["policies"]["coordinator"]["metrics"]["team_hours"]
    waiting = [{"incident_id": o["incident_id"], "label": short(o["incident_id"]), "region": o["region"], "rank": o["rank"],
                "probability": o["probability"], "recommendation": o["recommendation"],
                "unattended_burned_cells": _stat(pi["coordinator"][o["incident_id"]]["burned_cells"])} for o in others]
    higher_ranked_waiting = [w for w in waiting if w["rank"] < pred["priority"]["rank"]]

    # simulated benefit of the crew at EACH incident (same seeds), so trade-offs are visible, not hidden
    benefit = {incident_id: gain}
    for o in others:
        s2 = store.simulate(base_req.model_copy(update={"scenario_id": scenario["scenario_id"],
                                                         "coordinator_assignment": o["incident_id"], "teams": 1}))
        a2 = next(x for x in s2["policies"]["coordinator"]["metrics"]["per_incident"] if x["incident_id"] == o["incident_id"])
        benefit[o["incident_id"]] = round(pi["none"][o["incident_id"]]["burned_cells"]["mean"] - a2["burned_cells"]["mean"], 2)
    for w in waiting:
        w["simulated_crew_benefit_cells"] = benefit[w["incident_id"]]
    best_sim = max(benefit, key=benefit.get)

    # ---------------- recommended action ----------------
    if rec == "INSPECT":
        action = "SEND_CREW" if feas["status"] == "FEASIBLE" else "ESCALATE"
    elif rec == "RECHECK":
        action = "RECHECK"
    else:
        action = "MONITOR"
    why = {
        "SEND_CREW": "Recommended for crew deployment because it has the strongest evidence-supported priority among the competing incidents and the crew can be assigned within its jurisdiction.",
        "ESCALATE": (f"It has the strongest evidence-supported priority, but crew assignment is not directly actionable "
                     f"({feas['label'].lower()}). Request an authorised local partner or escalate for coordination."),
        "RECHECK": "Recommended for recheck because the evidence is limited, unusual or incomplete.",
        "MONITOR": "Recommended for monitoring because its signal is weaker than higher-priority incidents under current capacity.",
    }[action]

    under = [
        f"Verification is delayed while the model estimates a {pred['probability'] * 100:.0f}% chance of further satellite-detected activity within 48 hours.",
        (f"In the hypothetical simulation, leaving it unattended averaged {unattended['mean']:.1f} burned cells versus "
         f"{attended['mean']:.1f} with the crew (difference {gain:+.1f} cells, {base_req.n_seeds} matched runs)."
         if gain > 0 else
         f"In the hypothetical simulation, sending the crew made little difference here ({attended['mean']:.1f} vs {unattended['mean']:.1f} burned cells)."),
    ]
    if inc["protected_area"]["distance_km"] <= 10:
        under.append(f"It is about {inc['protected_area']['distance_km']:.0f} km from {inc['protected_area']['name']} (approximate boundary); exposure could grow if activity persists.")
    over = [
        f"The crew would spend about {hours['mean']:.1f} crew-hours (≈ RM {cost['mean']:,.0f}, illustrative) on this incident.",
    ]
    if pred["above_alert_threshold"] is False:
        over.append(f"The estimate is below the alert threshold; on held-out data, {(1 - (ev.get('precision') or 0)) * 100:.0f}% of alerts "
                    "even above the threshold had no follow-up detection.")
    for w in waiting:
        over.append(f"{w['label']} ({w['region']}, {w['probability'] * 100:.0f}% estimate, rank {w['rank']}) would wait without a crew"
                    f"{'; it ranks higher' if w in higher_ranked_waiting else ''}.")

    sim_tradeoff = None
    if best_sim != incident_id and benefit[best_sim] > gain + 0.5:
        sim_tradeoff = (f"In the hypothetical simulation, the crew would avert more burned cells at {short(best_sim)} "
                        f"({benefit[best_sim]:+.1f} cells) than here ({gain:+.1f}). The simulator's fire spread does not use the "
                        "satellite evidence or the 48-hour estimate, so the two can disagree; the recommendation follows the "
                        "evidence-based priority.")
        over.append(sim_tradeoff)

    prediction_report = {
        "title": f"Prediction Report — {short(incident_id)}",
        "incident": {
            "id": incident_id, "region": inc["region"], "country": inc["country"], "lat": inc["lat"], "lon": inc["lon"],
            "first_detected": inc["observed_at"], "satellite": inc["satellite"],
            "protected_area": inc["protected_area"],
            "recent_detections": {"previous_24h": format_value("prior_24h", float(store.cand.loc[meta['candidate_id'], 'prior_24h'])),
                                  "previous_7d": format_value("prior_7d", float(store.cand.loc[meta['candidate_id'], 'prior_7d']))},
            "weather": inc["weather"],
        },
        "prediction": {
            "probability": pred["probability"], "threshold": pred["threshold"], "above_threshold": pred["above_alert_threshold"],
            "risk_category": "High" if pred["probability"] >= pred["threshold"] else ("Medium" if pred["probability"] >= pred["threshold"] / 2 else "Low"),
            "risk_rule": f"High ≥ alert threshold ({pred['threshold'] * 100:.0f}%), Medium ≥ half the threshold, otherwise Low.",
            "evidence_quality": {"High": "Strong", "Medium": "Moderate", "Low": "Weak"}[pred["evidence"]["quality"]],
            "target": pred["model"]["target"], "calibration_note": pred["calibration_note"], "tree_variation": pred["tree_variation"],
        },
        "anomaly": pred["anomaly"],
        "heat_signal": pred["heat_signal"],
        "proof": [f"{f['name']}: {f['value_text']}{(' · ' + f['comparison_text']) if f.get('comparison') else ''} — {f['effect_text']}."
                  for f in pred["explained_factors"]] + pred["anomaly"]["proof"],
        "reliability": {
            "missing_weather": bool(inc["weather"]["missing"]), "unusual_inputs": bool(pred["ood_features"]),
            "satellite_evidence": {"High": "Strong", "Medium": "Moderate", "Low": "Weak"}[pred["evidence"]["quality"]],
            "noise": noise,
            "confidence_note": ("Caution: weak or unusual signal — RECHECK recommended." if rec == "RECHECK" else
                                "This estimate is based on limited evidence." if pred["evidence"]["quality"] != "High" else
                                "Evidence is comparatively strong for this incident."),
            "limitations": pred["evidence_limitations"],
            "improve_confidence": pred["confidence_guidance"],
        },
        "false_alarms": {
            "precision": ev.get("precision"), "false_positive_rate": ev.get("false_positive_rate"), "recall": ev.get("recall"),
            "threshold": ev.get("threshold"), "n": ev.get("n"), "period": "held-out 2025 test year",
            "text": (f"At the alert threshold, {ev.get('precision', 0) * 100:.0f}% of flagged incidents had a follow-up detection; "
                     f"{ev.get('false_positive_rate', 0) * 100:.1f}% of incidents without follow-up were flagged (n = {ev.get('n', 0):,})."),
        },
        "limits": ["Predicts later satellite detection, not wildfire spread, severity or damage.",
                   "Pattern categories are verification aids; they do not establish illegal activity."],
    }

    recommendation_report = {
        "title": f"Recommendation Report — {short(incident_id)}",
        "action": action, "action_label": ACTION[action]["label"], "record_action": ACTION[action]["record"],
        "deterministic_recommendation": rec,
        "urgency": urg,
        "urgency_table": [
            {"level": "Critical", "meaning": "High risk + strong evidence (+ strong heat signal or high evidence quality)", "action": "Send crew / immediate coordination", "window": "Act now"},
            {"level": "High", "meaning": "Concerning case, should be reviewed quickly", "action": "Assign crew if feasible", "window": "Next operational cycle"},
            {"level": "Moderate", "meaning": "Needs verification or follow-up", "action": "Recheck soon", "window": "After the next satellite observation"},
            {"level": "Low", "meaning": "Low evidence or lower priority", "action": "Monitor", "window": "Continue monitoring"},
        ],
        "why": why,
        "why_points": pred["urgency"]["reasons"] + [pred["ranking_explanation"]["text"]],
        "ranking": pred["ranking_explanation"],
        "feasibility": feas,
        "consequences": {
            "under_response": under, "over_response": over,
            "simulation": {"crew_here": _stat(attended), "no_crew_here": _stat(unattended), "difference_cells": gain,
                           "runs": base_req.n_seeds, "response_delay_steps": base_req.response_delay,
                           "crew_benefit_by_incident": [{"incident_id": k, "label": short(k), "cells": v} for k, v in benefit.items()],
                           "tradeoff": sim_tradeoff,
                           "note": "Hypothetical simulation on a procedural plot under stated assumptions; not a forecast of real damage."},
        },
        "waiting": waiting,
        "options": [{"action": k, "label": v["label"], "record": v["record"], "recommended": k == action} for k, v in ACTION.items()],
    }
    return {"incident_id": incident_id, "prediction_report": prediction_report, "recommendation_report": recommendation_report}
