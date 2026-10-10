"""Loads the committed data snapshot + model once and serves incidents, predictions and simulations."""
from __future__ import annotations

import json
import math
from functools import lru_cache

import joblib
import numpy as np
import pandas as pd

from ml.config import MODEL_DIR, PROCESSED_DIR, PROTECTED_AREAS
from ml.explain import explain
from ml.fetch_weather import load_weather
from sim.automaton import H, W, make_plot
from sim.policies import simulate_policies

from . import db
from .priority import (CATEGORY_TEXT, allocation_order, categorise, evidence_quality, exposure_score,
                       priority_score, recency_score, recommend)

SAT_NAMES = {"N": "Suomi NPP · VIIRS", "N20": "NOAA-20 · VIIRS", "1": "NOAA-20 · VIIRS", "N21": "NOAA-21 · VIIRS"}
LIMITATIONS = [
    "Predicts follow-up satellite detection, not fire spread, severity or damage.",
    "A low probability does not confirm that a fire has gone out; clouds and orbit gaps hide fires.",
    "Protected-area boundaries are approximate unless marked verified.",
    "The model has only seen data from the study period and region; unusual inputs are flagged.",
]


WEATHER_FEATURES = ["temperature_2m_max", "relative_humidity_2m_min", "precip_3d", "precip_7d", "days_since_rain",
                    "wind_speed_10m_max", "et0_fao_evapotranspiration"]


def _features(bundle: dict, cand: pd.DataFrame, candidate_id: str, overrides: dict | None) -> pd.Series:
    row = cand.loc[candidate_id].copy()
    for k, v in (overrides or {}).items():
        if k in bundle["features"]:
            row[k] = np.nan if v is None else float(v)
    row["weather_missing"] = int(any(pd.isna(row[c]) for c in WEATHER_FEATURES))
    return row


def score_candidate(bundle: dict, cand: pd.DataFrame, candidate_id: str, replay_ns: int, overrides: dict | None = None) -> dict:
    row = _features(bundle, cand, candidate_id, overrides)
    if bundle["chosen"] == "random_forest":
        ex = explain(bundle, row)
    else:  # baseline served: probability from historical frequency only
        p = float(bundle["baseline"].predict_proba(np.log1p([[row["hist_365d"]]]))[0, 1])
        ex = {"probability": round(p, 4), "interval": [round(p, 4), round(p, 4)], "tree_spread": 0.0,
              "factors": [], "missing_features": [], "ood_features": []}
    c = row.to_dict()
    ev = evidence_quality(c, ex["missing_features"], ex["ood_features"])
    expo = exposure_score(float(row["pa_dist_km"]))
    rec = recency_score((replay_ns - int(row["t_ns"])) / 3.6e12)
    score, parts = priority_score(ex["probability"], expo, rec, ev["score"])
    cat = categorise(c, ex["probability"], ev, expo)
    return {"row": row, "explain": ex, "evidence": ev, "exposure": expo, "recency": rec,
            "score": score, "components": parts, "category": cat}


def score_scenario(bundle: dict, cand: pd.DataFrame, mapping: dict[str, str], replay_ns: int, teams: int,
                   overrides: dict[str, dict] | None = None) -> tuple[dict, dict, list[str]]:
    scored = {iid: score_candidate(bundle, cand, cid, replay_ns, (overrides or {}).get(iid)) for iid, cid in mapping.items()}
    table = [{"id": k, "score": v["score"], "evidence_quality": v["evidence"]["quality"],
              "ood_count": len(v["explain"]["ood_features"])} for k, v in scored.items()]
    recs = recommend(table, teams)
    return scored, recs, allocation_order(table, recs)


class Store:
    def __init__(self) -> None:
        self.bundle = joblib.load(MODEL_DIR / "model.joblib")
        self.cand = pd.read_parquet(PROCESSED_DIR / "candidates.parquet").set_index("candidate_id")
        self.scen = json.loads((PROCESSED_DIR / "scenarios.json").read_text())["scenarios"]
        self.prov = json.loads((PROCESSED_DIR / "provenance.json").read_text())
        self.evaluation = json.loads((PROCESSED_DIR / "evaluation.json").read_text())
        self.audit = json.loads((PROCESSED_DIR / "audit.json").read_text())
        bt = PROCESSED_DIR / "policy_backtest.json"
        self.backtest = json.loads(bt.read_text()) if bt.exists() else None
        tiles = sorted({(r.wlat, r.wlon) for r in self.cand.itertuples() if not pd.isna(r.wlat)})
        w = load_weather(tiles)
        self.weather = w.set_index(["tile_lat", "tile_lon", "date"]) if len(w) else None
        self.inc_index = {i["incident_id"]: (s, i) for s in self.scen for i in s["incidents"]}

    # ------------------------------------------------------------------ scenarios / incidents
    def scenario(self, scenario_id: str | None = None) -> dict:
        if scenario_id:
            for s in self.scen:
                if s["scenario_id"] == scenario_id:
                    return s
            raise KeyError(scenario_id)
        return next((s for s in self.scen if s["default"]), self.scen[0])

    def scenario_meta(self, s: dict) -> dict:
        return {"id": s["scenario_id"], "day": s["day"], "replay_time_utc": s["replay_time_utc"],
                "countries": s["countries"], "candidates_that_day": s["candidates_that_day"], "is_default": s["default"]}

    def _weather(self, row: pd.Series) -> dict:
        out = {"date": None if pd.isna(row.get("wdate")) else str(row["wdate"])}
        keys = ["temperature_2m_max", "relative_humidity_2m_min", "precip_7d", "days_since_rain", "wind_speed_10m_max"]
        for k in keys:
            v = row.get(k)
            out[k] = None if v is None or pd.isna(v) else round(float(v), 1)
        out["wind_direction_10m_dominant"] = None
        if self.weather is not None and not pd.isna(row.get("wlat")):
            try:
                v = self.weather.loc[(row["wlat"], row["wlon"], row["wdate"]), "wind_direction_10m_dominant"]
                out["wind_direction_10m_dominant"] = None if pd.isna(v) else round(float(v))
            except KeyError:
                pass
        out["missing"] = bool(row.get("weather_missing", 0))
        return out

    def incident(self, incident_id: str, statuses: dict | None = None) -> dict:
        _, inc = self.inc_index[incident_id]
        statuses = statuses if statuses is not None else db.status_map()
        return self.incident_from_candidate(incident_id, inc["candidate_id"], inc["arrival_order"], statuses)

    def incident_from_candidate(self, incident_id: str, candidate_id: str, arrival_order: int, statuses: dict) -> dict:
        r = self.cand.loc[candidate_id]
        pa = PROTECTED_AREAS[int(r["pa_index"])]
        st = statuses.get(incident_id)
        return {
            "id": incident_id,
            "candidate_id": candidate_id,
            "arrival_order": arrival_order,
            "lat": round(float(r["lat"]), 5),
            "lon": round(float(r["lon"]), 5),
            "region": r["region"],
            "country": r["country"],
            "observed_at": pd.Timestamp(int(r["t_ns"]), tz="UTC").isoformat(),
            "satellite": SAT_NAMES.get(str(r["satellite"]), str(r["satellite"])),
            "daynight": "Night" if int(r["is_night"]) else "Day",
            "n_pixels": int(r["n_pixels"]),
            "frp_max_mw": round(float(r["frp_max"]), 1),
            "high_confidence_share": round(float(r["conf_h_frac"]), 2),
            "low_confidence_share": round(float(r["conf_l_frac"]), 2),
            "protected_area": {"id": pa["id"], "name": pa["name"], "distance_km": round(float(r["pa_dist_km"]), 1),
                               "boundary": "approximate"},
            "weather": self._weather(r),
            "status": st[0] if st else db.DEFAULT_STATUS,
            "status_updated_at": st[1] if st else None,
        }

    def incidents(self, scenario_id: str | None = None) -> dict:
        s = self.scenario(scenario_id)
        statuses = db.status_map()
        return {
            "scenario": self.scenario_meta(s),
            "scenarios": [self.scenario_meta(x) for x in self.scen],
            "provenance": {k: self.prov.get(k) for k in ("source", "is_synthetic", "product", "period", "rows", "weather_conditioning")},
            "incidents": [self.incident(i["incident_id"], statuses) for i in s["incidents"]],
            "context_hotspots": self.context_hotspots(s),
            "teams_available": 1,
        }

    def context_hotspots(self, s: dict) -> list[dict]:
        """Other detection clusters from the previous 24 h up to the replay time (past-only context for the map)."""
        end = pd.Timestamp(s["replay_time_utc"]).value
        start = end - 24 * 3_600_000_000_000
        own = {i["candidate_id"] for i in s["incidents"]}
        c = self.cand[(self.cand.t_ns >= start) & (self.cand.t_ns <= end) & (~self.cand.index.isin(own))]
        return [{"lat": round(float(r.lat), 4), "lon": round(float(r.lon), 4),
                 "observed_at": pd.Timestamp(int(r.t_ns), tz="UTC").isoformat(),
                 "frp_max_mw": round(float(r.frp_max), 1), "n_pixels": int(r.n_pixels)} for r in c.itertuples()]

    # ------------------------------------------------------------------ prediction + prioritisation
    def prioritise(self, scenario: dict, teams: int, overrides: dict[str, dict] | None = None) -> tuple[dict, dict, list[str]]:
        """Score every incident in a scenario; returns (scored, recommendations, AI allocation order) keyed by incident id."""
        mapping = {i["incident_id"]: i["candidate_id"] for i in scenario["incidents"]}
        return score_scenario(self.bundle, self.cand, mapping, pd.Timestamp(scenario["replay_time_utc"]).value,
                              teams, overrides)

    def predict(self, incident_id: str, teams: int = 1, overrides: dict | None = None) -> dict:
        scenario, _ = self.inc_index[incident_id]
        scored, recs, _ = self.prioritise(scenario, teams, {incident_id: overrides or {}})
        me = scored[incident_id]
        ex = me["explain"]
        b = self.bundle
        thr = b["threshold_rf"] if b["chosen"] == "random_forest" else b["threshold_baseline"]
        competing = []
        for iid, v in scored.items():
            competing.append({"incident_id": iid, "region": v["row"]["region"], "probability": v["explain"]["probability"],
                              "priority_score": v["score"], "rank": recs[iid]["rank"],
                              "recommendation": recs[iid]["recommendation"]})
        competing.sort(key=lambda x: x["rank"])
        spread = ex["tree_spread"]
        note = ("Model trees broadly agree on this estimate." if spread < 0.25 else
                "Model trees disagree noticeably; treat the estimate with caution.")
        if ex["missing_features"]:
            note += " Some inputs were missing and were filled with typical values."
        if ex["ood_features"]:
            note += " Some inputs are outside the range seen in training."
        label = me["row"]["label_status"]
        return {
            "incident_id": incident_id,
            "model": {"name": "Random Forest" if b["chosen"] == "random_forest" else "Historical-frequency baseline",
                      "version": b["version"], "target": b["target"], "served": b["chosen"]},
            "probability": ex["probability"],
            "interval": ex["interval"],
            "threshold": round(float(thr), 3),
            "above_alert_threshold": ex["probability"] >= thr,
            "category": me["category"],
            "category_label": CATEGORY_TEXT[me["category"]],
            "evidence": me["evidence"],
            "factors": ex["factors"],
            "missing_features": ex["missing_features"],
            "ood_features": ex["ood_features"],
            "priority": {"score": me["score"], "components": me["components"], "rank": recs[incident_id]["rank"],
                         "of": len(scored), "recommendation": recs[incident_id]["recommendation"],
                         "reason": recs[incident_id]["reason"]},
            "competing": competing,
            "uncertainty_note": note,
            "limitations": LIMITATIONS,
            "retrospective_label": {"positive": "Follow-up detection observed within 48 h",
                                    "negative": "No qualifying follow-up detection observed within 48 h",
                                    "uncertain": "Only low-confidence follow-up detections",
                                    "censored": "Outside observation record"}.get(label),
        }

    # ------------------------------------------------------------------ simulation
    @staticmethod
    def dryness_from_weather(w: dict) -> tuple[float, bool]:
        dsr, rh, p7 = w.get("days_since_rain"), w.get("relative_humidity_2m_min"), w.get("precip_7d")
        if dsr is None or rh is None or p7 is None:
            return 0.5, False
        d = 0.4 * min(dsr, 21) / 21 + 0.35 * min(max((85 - rh) / 45, 0), 1) + 0.25 * math.exp(-p7 / 15)
        return round(min(max(d, 0), 1), 3), True

    def simulate(self, req) -> dict:
        scenario = self.scenario(req.scenario_id)
        ids = [i["incident_id"] for i in scenario["incidents"]]
        _, recs, ai_order = self.prioritise(scenario, req.teams)
        arrival_order = [i["incident_id"] for i in sorted(scenario["incidents"], key=lambda x: x["arrival_order"])]
        statuses = db.status_map()
        plots, infos = self.build_plots([self.incident(iid, statuses) for iid in ids], req.per_incident)
        res = simulate_policies(plots, arrival_order, ai_order, req.teams, req.response_delay, req.steps,
                                req.seed, req.n_seeds)
        return {
            "scenario_id": scenario["scenario_id"],
            "grid": {"plots": len(plots), "h": H, "w": W},
            "seed": req.seed, "n_seeds": req.n_seeds, "steps": req.steps, "teams": req.teams,
            "response_delay": req.response_delay,
            "arrival_order": arrival_order, "ai_order": ai_order,
            "plots": infos,
            **res,
            "disclaimer": ("Hypothetical scenario on a procedurally generated forest plot. Not a reconstruction of the "
                           "real site and not a validated wildfire forecast."),
        }

    def build_plots(self, incidents: list[dict], per_incident: dict) -> tuple[list, list]:
        plots, infos = [], []
        for inc in incidents:
            iid = inc["id"]
            w = inc["weather"]
            o = per_incident.get(iid)
            dry, real = self.dryness_from_weather(w)
            ws = w["wind_speed_10m_max"] if w["wind_speed_10m_max"] is not None else 12.0
            wd = w["wind_direction_10m_dominant"] if w["wind_direction_10m_dominant"] is not None else 225.0
            defaults_from = "observed weather (previous UTC day)" if real else "default values (weather missing)"
            if o:
                ws = o.wind_speed if o.wind_speed is not None else ws
                wd = o.wind_dir_deg if o.wind_dir_deg is not None else wd
                dry = o.dryness if o.dryness is not None else dry
            ign = None
            if o and o.ignition:
                ign = [(int(r), int(c)) for r, c in o.ignition if 0 <= r < H and 0 <= c < W]
            expo = exposure_score(inc["protected_area"]["distance_km"])
            p = make_plot(iid, expo, inc["n_pixels"], float(ws), float(wd), float(dry), ign or None)
            plots.append(p)
            infos.append({
                "incident_id": iid,
                "fuel": "".join(str(int(round(v * 9))) for v in p.fuel.reshape(-1)),
                "protected": "".join("1" if v else "0" for v in p.protected.reshape(-1)),
                "ignition": [list(x) for x in p.ignition],
                "wind_speed": round(float(ws), 1), "wind_dir_deg": round(float(wd)), "dryness": round(float(dry), 3),
                "defaults_from": defaults_from,
            })
        return plots, infos


@lru_cache(maxsize=1)
def store() -> Store:
    db.init()
    return Store()
