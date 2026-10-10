"""Backtest of the team-allocation policies over every qualifying test-period day.

Two complementary measurements (both with one team, the core problem setting):
  1. Retrospective (real labels): how often did the incident each policy would have sent the team to actually
     show follow-up satellite activity within 48 h? Compared with first-alert-first and a random pick.
  2. Simulation (hypothetical): mean loss-index difference, first-alert minus AI-priority, using the same
     cellular automaton and common random numbers as the Command Center.

Usage:  python -m ml.policy_backtest
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd

from app.service import Store, score_scenario
from sim.policies import simulate_policies

from .config import PROCESSED_DIR

N_SEEDS = 8
RESPONSE_DELAY = 4
STEPS = 48


def main() -> None:
    s = Store()
    days = json.loads((PROCESSED_DIR / "scenario_days.json").read_text())
    rows = []
    for d in days:
        ids = [f"BT-{d['day']}-{k}" for k in range(3)]
        mapping = dict(zip(ids, d["candidate_ids"]))
        replay = max(int(s.cand.loc[c, "t_ns"]) for c in d["candidate_ids"]) + 30 * 60 * 10**9
        scored, recs, ai_order = score_scenario(s.bundle, s.cand, mapping, replay, teams=1)
        y = {i: int(s.cand.loc[c, "y"]) for i, c in mapping.items()}
        label_known = {i: s.cand.loc[c, "label_status"] in ("positive", "negative") for i, c in mapping.items()}
        incidents = [s.incident_from_candidate(i, c, k + 1, {}) for k, (i, c) in enumerate(mapping.items())]
        plots, _ = s.build_plots(incidents, {})
        res = simulate_policies(plots, ids, ai_order, 1, RESPONSE_DELAY, STEPS, seed=11, n_seeds=N_SEEDS)
        li = res["comparison"]["loss_index"]
        rows.append({
            "day": d["day"],
            "disagree": ai_order[0] != ids[0],
            "labels_known": all(label_known.values()),
            "first_alert_followup": y[ids[0]],
            "ai_followup": y[ai_order[0]],
            "random_followup": float(np.mean(list(y.values()))),
            "any_followup": int(max(y.values())),
            "loss_diff": li["difference_mean"],
            "first_alert_loss": li["first_alert_mean"],
            "ai_loss": li["ai_priority_mean"],
        })
    df = pd.DataFrame(rows)
    known = df[df.labels_known]
    dis = known[known.disagree]

    def boot_ci(v: np.ndarray, n: int = 2000) -> list[float]:
        rng = np.random.default_rng(0)
        if len(v) == 0:
            return [float("nan"), float("nan")]
        m = [rng.choice(v, len(v)).mean() for _ in range(n)]
        return [round(float(np.percentile(m, 2.5)), 4), round(float(np.percentile(m, 97.5)), 4)]

    out = {
        "description": __doc__.split("Usage")[0].strip(),
        "days_evaluated": int(len(df)),
        "days_with_known_labels": int(len(known)),
        "days_policies_disagree": int(df.disagree.sum()),
        "retrospective": {
            "all_days": {
                "ai_pick_followup_rate": round(float(known.ai_followup.mean()), 4),
                "first_alert_pick_followup_rate": round(float(known.first_alert_followup.mean()), 4),
                "random_pick_followup_rate": round(float(known.random_followup.mean()), 4),
                "difference_ai_minus_first_alert_ci95": boot_ci((known.ai_followup - known.first_alert_followup).to_numpy()),
            },
            "disagreement_days": {
                "n": int(len(dis)),
                "ai_pick_followup_rate": round(float(dis.ai_followup.mean()), 4) if len(dis) else None,
                "first_alert_pick_followup_rate": round(float(dis.first_alert_followup.mean()), 4) if len(dis) else None,
                "difference_ai_minus_first_alert_ci95": boot_ci((dis.ai_followup - dis.first_alert_followup).to_numpy()),
            },
            "note": "Follow-up detection is a proxy for persistent activity, not confirmed damage.",
        },
        "simulation": {
            "n_seeds_per_day": N_SEEDS, "response_delay_steps": RESPONSE_DELAY, "steps": STEPS,
            "mean_loss_first_alert": round(float(df.first_alert_loss.mean()), 2),
            "mean_loss_ai_priority": round(float(df.ai_loss.mean()), 2),
            "mean_loss_difference": round(float(df.loss_diff.mean()), 2),
            "difference_ci95": boot_ci(df.loss_diff.to_numpy()),
            "days_ai_lower_loss": int((df.loss_diff > 0).sum()),
            "days_first_alert_lower_loss": int((df.loss_diff < 0).sum()),
            "days_tied": int((df.loss_diff == 0).sum()),
            "note": "Hypothetical simulation on procedural plots; not a forecast of real outcomes.",
        },
    }
    (PROCESSED_DIR / "policy_backtest.json").write_text(json.dumps(out, indent=2))
    print(json.dumps({k: out[k] for k in ("days_evaluated", "days_policies_disagree", "retrospective", "simulation")}, indent=2))


if __name__ == "__main__":
    main()
