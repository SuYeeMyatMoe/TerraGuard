import json

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.main import app
from ml import footprint
from ml.config import LABEL_MIN_H
from ml.incidents import H

HAVE_MODEL = footprint.OUT.exists()


def _det(rows):
    df = pd.DataFrame(rows, columns=["latitude", "longitude", "t_ns", "conf"])
    return df


def test_target_counts_unique_pixels_in_radius_and_window():
    t0 = 10**18
    later = t0 + (LABEL_MIN_H + 1) * H
    det = _det([
        (1.0, 110.0, later, 1),                     # counted
        (1.0, 110.0, later + 600 * 10**9, 2),       # same pixel, second satellite -> de-duplicated
        (1.01, 110.0, later, 1),                    # ~1.1 km away -> counted
        (1.2, 110.0, later, 2),                     # ~22 km away -> outside 5 km
        (1.0, 110.005, t0 + 1 * H, 2),              # before LABEL_MIN_H -> not in the future window
        (1.0, 110.008, later, 0),                   # low confidence -> ignored
        (1.0, 110.0, t0 - 2 * H, 1),                # past 24 h -> persistence only
        (1.0, 110.0, t0 + 400 * H, 1),              # far future; also sets the data end
    ])
    cand = pd.DataFrame({"candidate_id": ["C1"], "lat": [1.0], "lon": [110.0], "t_ns": [t0]})
    out = footprint.count_targets(cand, det).iloc[0]
    assert out.future_cells_48h == 2
    assert out.past_cells_24h == 1


def test_censored_candidates_have_no_target():
    t0 = 10**18
    det = _det([(1.0, 110.0, t0 + 5 * H, 1)])      # data ends before t + 48 h
    cand = pd.DataFrame({"candidate_id": ["C1"], "lat": [1.0], "lon": [110.0], "t_ns": [t0]})
    assert np.isnan(footprint.count_targets(cand, det).iloc[0].future_cells_48h)


@pytest.mark.skipif(not HAVE_MODEL, reason="footprint model not built")
def test_eval_has_baselines_and_coverage():
    ev = json.loads(footprint.EVAL.read_text())
    assert {"model", "persistence_24h", "climatology"} <= set(ev["expected_footprint"])
    assert 0 <= ev["size_if_any"]["coverage_10_90"] <= 1 and 0.5 < ev["any_footprint"]["auc"] <= 1
    assert ev["n_test"] > 1000
    # the served claim "better than repeating the last 24 h" must match the numbers
    m, p = ev["expected_footprint"]["model"], ev["expected_footprint"]["persistence_24h"]
    assert ev["beats_persistence"]["mae"] == (m["mae_km2"] < p["mae_km2"])


@pytest.mark.skipif(not HAVE_MODEL, reason="footprint model not built")
def test_served_footprint_is_ordered_and_matches_model():
    with TestClient(app) as c:
        iid = c.get("/api/incidents").json()["incidents"][0]["id"]
        fp = c.post("/api/predict", json={"incident_id": iid}).json()["footprint"]
        from app.service import store
        s = store()
        cid = s.inc_index[iid][1]["candidate_id"]
        direct = footprint.forecast(s.cand.loc[cid], cid)
    assert 0 <= fp["p10_km2"] <= fp["median_km2"] <= fp["p90_km2"]
    assert fp["median_km2"] == direct["median_km2"]
    assert "not mapped burned area" in fp["note"]


@pytest.mark.skipif(not HAVE_MODEL, reason="footprint model not built")
def test_report_replay_frames_are_complete():
    with TestClient(app) as c:
        iid = c.get("/api/incidents").json()["incidents"][0]["id"]
        rr = c.post(f"/api/reports/{iid}", json={"n_seeds": 4, "steps": 24}).json()["recommendation_report"]
    rp = rr["consequences"]["simulation"]["replay"]
    assert len(rp["crew_here"]) == len(rp["no_crew"]) == rp["steps"] + 1 == 25
    assert all(len(f) == rp["h"] * rp["w"] for f in rp["crew_here"])
    assert rp["no_crew_burned"] == sum(ch in "23" for ch in rp["no_crew"][-1])
