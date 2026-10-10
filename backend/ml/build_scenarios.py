"""Select historical replay scenarios with a fixed, outcome-blind rule.

Rule (documented in docs/DATA.md):
  1. Consider test-period days (UTC) only, so the served model never saw these labels.
  2. Within a day, walk candidates in observation order and keep each one that is >= 50 km from those
     already kept, until three incidents are selected.
  3. Rank qualifying days by the number of candidates observed that day; keep the top 5.
  4. The default scenario is the highest-ranked day on which the first-alert and AI-priority policies would
     send the single available team to DIFFERENT incidents (when they agree there is nothing to compare),
     preferring days spanning both Malaysia and Indonesia. This uses the policies' decisions only.
Labels and simulation outcomes play no part in the selection. All qualifying days are written to
scenario_days.json and evaluated in ml.policy_backtest.

Usage:  python -m ml.build_scenarios
"""
from __future__ import annotations

import json

import joblib
import pandas as pd

from app.service import score_scenario

from .config import MODEL_DIR, PROCESSED_DIR, TEST_START
from .geo import haversine_km

MIN_SEPARATION_KM = 50.0


def main() -> None:
    cand = pd.read_parquet(PROCESSED_DIR / "candidates.parquet")
    test = cand[(cand.t_ns >= pd.Timestamp(TEST_START, tz="UTC").value) & (cand.label_status != "censored")].copy()
    test["day"] = pd.to_datetime(test.t_ns, utc=True).dt.strftime("%Y-%m-%d")
    days = []
    for day, g in test.groupby("day"):
        g = g.sort_values("t_ns")
        picked = []
        for _, r in g.iterrows():
            if all(haversine_km(r.lat, r.lon, p.lat, p.lon) >= MIN_SEPARATION_KM for p in picked):
                picked.append(r)
            if len(picked) == 3:
                break
        if len(picked) == 3:
            days.append({"day": day, "n_candidates": int(len(g)), "picked": picked})
    days.sort(key=lambda d: -d["n_candidates"])
    bundle = joblib.load(MODEL_DIR / "model.joblib")
    cidx = cand.set_index("candidate_id")
    for d in days:
        mapping = {f"X{k}": p.candidate_id for k, p in enumerate(d["picked"])}
        replay = max(p.t_ns for p in d["picked"]) + 30 * 60 * 10**9
        _, _, ai_order = score_scenario(bundle, cidx, mapping, replay, teams=1)
        d["disagree"] = ai_order[0] != "X0"
    all_days = [{"day": d["day"], "n_candidates": d["n_candidates"], "candidate_ids": [p.candidate_id for p in d["picked"]],
                 "policies_disagree": d["disagree"]} for d in days]
    (PROCESSED_DIR / "scenario_days.json").write_text(json.dumps(all_days, indent=2))
    disagree = [d for d in days if d["disagree"]]
    pref = [d for d in disagree if len({p.country for p in d["picked"]}) > 1] or disagree or days
    default_day = pref[0]
    top = [default_day] + [d for d in days if d is not default_day][:4]
    top.sort(key=lambda d: -d["n_candidates"])
    default = default_day["day"]

    scenarios = []
    for d in top:
        replay = max(p.t_ns for p in d["picked"]) + 30 * 60 * 10**9
        incs = []
        for order, p in enumerate(d["picked"], start=1):
            letter = "ABC"[order - 1]
            incs.append({
                "incident_id": f"INC-{d['day'].replace('-', '')}-{letter}",
                "candidate_id": p.candidate_id,
                "arrival_order": order,
            })
        scenarios.append({
            "scenario_id": f"SCN-{d['day'].replace('-', '')}",
            "day": d["day"],
            "replay_time_utc": pd.Timestamp(replay, tz="UTC").isoformat(),
            "candidates_that_day": d["n_candidates"],
            "countries": sorted({p.country for p in d["picked"]}),
            "incidents": incs,
            "policies_disagree": d["disagree"],
            "default": d["day"] == default,
        })
    out = {"rule": __doc__.split("Usage")[0].strip(), "scenarios": scenarios}
    (PROCESSED_DIR / "scenarios.json").write_text(json.dumps(out, indent=2))
    for s in scenarios:
        print(s["scenario_id"], s["countries"], s["candidates_that_day"], "default" if s["default"] else "")


if __name__ == "__main__":
    main()
