"""Outcome metrics for the cellular automaton and the B-vs-C comparison across seeds."""
from __future__ import annotations

import numpy as np

from .automaton import ASSUMPTIONS


def encode_frames(frames: list[np.ndarray]) -> list[list[str]]:
    """frames[t] is (P,H,W) int8 -> one digit-string (H*W chars, row-major) per plot per step."""
    return [["".join(map(str, f[p].reshape(-1).tolist())) for p in range(f.shape[0])] for f in frames]


def summarise(out: dict, ids: list[str], assigned: list[str], arrivals: np.ndarray, steps: int) -> dict:
    mps = ASSUMPTIONS["minutes_per_step"]
    burned = out["burned"].astype(float)            # (S,P)
    prot = out["protected_burned"].astype(float)
    S = burned.shape[0]
    team_steps = np.zeros(S)
    for pi, i in enumerate(ids):
        if i in assigned:
            # dispatch -> last active step (or arrival, if fire was already out)
            team_steps += np.maximum(out["active_until"][:, pi], min(arrivals[pi], steps))
    team_hours = team_steps * mps / 60.0
    cost = team_hours * ASSUMPTIONS["team_cost_rm_per_hour"] + len(assigned) * ASSUMPTIONS["dispatch_cost_rm"]
    loss = burned.sum(1) * ASSUMPTIONS["loss_index_per_burned_cell"] + prot.sum(1) * ASSUMPTIONS["loss_index_per_protected_cell"]

    def stat(v):
        v = np.asarray(v, dtype=float)
        return {"display": round(float(v[0]), 2), "mean": round(float(v.mean()), 2),
                "ci95": round(float(1.96 * v.std(ddof=1) / np.sqrt(len(v))) if len(v) > 1 else 0.0, 2)}

    per_incident = []
    for pi, i in enumerate(ids):
        per_incident.append({
            "incident_id": i,
            "team_assigned": i in assigned,
            "response_delay_steps": int(arrivals[pi]) if np.isfinite(arrivals[pi]) else None,
            "burned_cells": stat(burned[:, pi]),
            "protected_cells_burned": stat(prot[:, pi]),
            "still_burning_at_end": bool(out["still_burning"][0, pi]),
        })
    return {
        "burned_cells": stat(burned.sum(1)),
        "protected_cells_burned": stat(prot.sum(1)),
        "team_hours": stat(team_hours),
        "response_cost_rm": stat(cost),
        "loss_index": stat(loss),
        "per_incident": per_incident,
        "_loss_per_seed": loss.tolist(),
        "_prot_per_seed": prot.sum(1).tolist(),
        "_burned_per_seed": burned.sum(1).tolist(),
    }


def compare(results: dict) -> dict:
    b, c, a = results["first_alert"]["metrics"], results["ai_priority"]["metrics"], results["none"]["metrics"]
    out = {}
    for key, name in (("_loss_per_seed", "loss_index"), ("_prot_per_seed", "protected_cells_burned"),
                      ("_burned_per_seed", "burned_cells")):
        d = np.array(b[key]) - np.array(c[key])      # positive => AI-priority better
        n = len(d)
        out[name] = {
            "first_alert_mean": round(float(np.mean(b[key])), 2),
            "ai_priority_mean": round(float(np.mean(c[key])), 2),
            "no_response_mean": round(float(np.mean(a[key])), 2),
            "difference_mean": round(float(d.mean()), 2),
            "difference_ci95": round(float(1.96 * d.std(ddof=1) / np.sqrt(n)) if n > 1 else 0.0, 2),
            "seeds_ai_better": int((d > 0).sum()),
            "seeds_tied": int((d == 0).sum()),
            "seeds_first_alert_better": int((d < 0).sum()),
            "n_seeds": n,
        }
    same = results["first_alert"]["assigned"] == results["ai_priority"]["assigned"]
    out["same_allocation"] = bool(same)
    out["note"] = ("Both policies chose the same incidents, so outcomes are identical by construction."
                   if same else "Positive differences mean the AI-prioritised allocation produced lower values.")
    for r in results.values():
        for k in ("_loss_per_seed", "_prot_per_seed", "_burned_per_seed"):
            r["metrics"].pop(k, None)
    return out
