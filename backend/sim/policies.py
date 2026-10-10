"""Response policies and the fair multi-seed comparison.

A — none           : no response (hypothetical reference).
B — first_alert    : teams go to incidents in order of first satellite observation.
C — ai_priority    : teams go to incidents in the order produced by the deterministic Layer-2 prioritiser
                     (computed from predictions/evidence BEFORE any simulation is run).

Fairness: every policy sees identical plots, ignitions, weather, horizon, team counts, delay and the
same pre-drawn random tensor (common random numbers).
"""
from __future__ import annotations

import numpy as np

from .automaton import ASSUMPTIONS, PlotSpec, run
from .metrics import compare, encode_frames, summarise

POLICIES = ("none", "first_alert", "ai_priority")


def allocate(policy: str, arrival_order: list[str], ai_order: list[str], teams: int,
             coordinator: str | None = None) -> list[str]:
    if policy == "none" or teams <= 0:
        return []
    if policy == "coordinator":
        return [coordinator] if coordinator else []
    order = arrival_order if policy == "first_alert" else ai_order
    return order[:teams]


def simulate_policies(plots: list[PlotSpec], arrival_order: list[str], ai_order: list[str], teams: int,
                      response_delay: int, steps: int, seed: int, n_seeds: int, coordinator: str | None = None,
                      burn_duration_steps: int | None = None, keep_all_frames: bool = False) -> dict:
    ids = [p.incident_id for p in plots]
    P = len(plots)
    rng = np.random.default_rng(seed)
    rand = rng.random((n_seeds, steps, P, plots[0].fuel.shape[0], plots[0].fuel.shape[1]), dtype=np.float32)
    results = {}
    policies = POLICIES + (("coordinator",) if coordinator else ())
    for policy in policies:
        assigned = allocate(policy, arrival_order, ai_order, teams, coordinator)
        arrivals = np.array([response_delay if i in assigned else np.inf for i in ids])
        teams_at = np.array([1 if i in assigned else 0 for i in ids])
        out = run(plots, arrivals, teams_at, steps, rand, keep_frames=True,
                  burn_duration_steps=burn_duration_steps, all_seeds=keep_all_frames)
        first = [f[0] for f in out["frames"]] if keep_all_frames else out["frames"]
        events = []
        for i in assigned:
            pi = ids.index(i)
            events.append({"step": 0, "incident_id": i, "type": "dispatch", "label": "Team dispatched"})
            if response_delay <= steps:
                events.append({"step": int(response_delay), "incident_id": i, "type": "arrival", "label": "Team on site"})
            cs = int(out["contained_step"][0, pi])
            if cs >= 0:
                events.append({"step": cs, "incident_id": i, "type": "contained", "label": "No active fire cells"})
        results[policy] = {
            "assigned": assigned,
            "frames": encode_frames(first),
            "events": sorted(events, key=lambda e: e["step"]),
            "metrics": summarise(out, ids, assigned, arrivals, steps),
        }
        if keep_all_frames:  # internal use only (reports); never serialised by the API
            results[policy]["_raw"] = {"frames": out["frames"], "burned": out["burned"]}
    return {
        "policies": results,
        "comparison": compare(results),
        "assumptions": {**ASSUMPTIONS, "burn_duration_steps": ASSUMPTIONS["burn_duration_steps"]
                        if burn_duration_steps is None else burn_duration_steps},
    }
