import re
import sqlite3

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app import feasibility, records
from app.main import app
from app.records import Records, SqliteStore
from ml import anomaly
from ml.config import MODEL_DIR

HAVE_ANOMALY = (MODEL_DIR / "anomaly.joblib").exists()
BANNED = re.compile(r"\billegal|\barson|\bwill spread|\bconfirmed (fire|burning)", re.I)


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def reports(client):
    ids = [i["id"] for i in client.get("/api/incidents").json()["incidents"]]
    return {i: client.post(f"/api/reports/{i}", json={"n_seeds": 6, "steps": 24}).json() for i in ids}


# ----------------------------------------------------------------------------- feasibility
def test_feasibility_rules():
    team = {"base": "Demo base", "base_lat": 2.29, "base_lon": 111.83, "base_region": "Sarawak", "base_country": "Malaysia"}
    near = feasibility.assess({"lat": 2.9, "lon": 112.1, "country": "Malaysia", "region": "Sarawak (Miri)"}, team)
    assert near["status"] == "FEASIBLE" and near["actionable"] and near["travel_time"] is None
    far = feasibility.assess({"lat": 4.4, "lon": 114.0, "country": "Malaysia", "region": "Sarawak"}, team)
    assert far["status"] == "UNKNOWN"   # beyond the straight-line planning radius
    border = feasibility.assess({"lat": -2.0, "lon": 113.5, "country": "Indonesia", "region": "Central Kalimantan"}, team)
    assert border["status"] == "REQUIRES_COORDINATION" and border["cross_border"] and not border["actionable"]
    assert any("Cross-border coordination required" in r for r in border["reasons"])
    state = feasibility.assess({"lat": 5.5, "lon": 117.6, "country": "Malaysia", "region": "Sabah"}, team)
    assert state["status"] == "REQUIRES_COORDINATION" and not state["cross_border"]
    # straight-line distance is haversine (Sibu -> Kota Kinabalu is roughly 640 km)
    kk = feasibility.assess({"lat": 5.98, "lon": 116.07, "country": "Malaysia", "region": "Sabah"}, team)
    assert 560 < kk["straight_line_km"] < 720 and kk["distance_label"].startswith("Straight-line")


# ----------------------------------------------------------------------------- anomaly layer
@pytest.mark.skipif(not HAVE_ANOMALY, reason="anomaly model not built")
def test_anomaly_patterns_follow_documented_rules():
    m = anomaly.load()
    r = m["rules"]
    base = {f: 0.0 for f in m["medians"].index}
    def row(**kw):
        return pd.Series({**base, **kw})
    assert anomaly.assess(row(), "Low", m)["pattern"] == "insufficient_evidence"
    assert anomaly.assess(row(hist_365d=r["hist_365d_p99"] + 1, prior_7d=6), "High", m)["pattern"] == "static_source_like"
    assert anomaly.assess(row(n_pixels=r["n_pixels_p95"] + 1), "High", m)["pattern"] == "cluster_anomaly"
    clr = anomaly.assess(row(prior_7d=4, frp_max=r["frp_max_p50"] - 1, hist_365d=r["hist_365d_p75"] + 1), "High", m)
    assert clr["pattern"] == "suspected_clearing_pattern" and clr["requires_verification"]
    assert "not evidence" in clr["meaning"] and "illegality" in clr["disclaimer"]
    assert anomaly.assess(row(track_age_h=30), "High", m)["pattern"] == "persistent_recurring"
    normal = anomaly.assess(row(), "High", m)
    assert normal["pattern"] == "isolated_normal" and not normal["requires_verification"]


# ----------------------------------------------------------------------------- reports
def test_reports_are_grounded_and_consistent(reports, client):
    for iid, r in reports.items():
        pr, rr = r["prediction_report"], r["recommendation_report"]
        pred = client.post("/api/predict", json={"incident_id": iid}).json()
        assert abs(pr["prediction"]["probability"] - pred["probability"]) < 1e-9
        assert rr["deterministic_recommendation"] == pred["priority"]["recommendation"]
        assert rr["urgency"]["label"] in ("Critical", "High", "Moderate", "Low")
        # action follows the deterministic recommendation and feasibility
        rec, feas = rr["deterministic_recommendation"], rr["feasibility"]["status"]
        expected = {"RECHECK": "RECHECK", "MONITOR": "MONITOR"}.get(rec) or ("SEND_CREW" if feas == "FEASIBLE" else "ESCALATE")
        assert rr["action"] == expected
        assert rr["feasibility"]["travel_time"] is None and "unavailable" in rr["feasibility"]["travel_note"]
        # consequences are tied to the matched-seed simulation numbers
        sim = rr["consequences"]["simulation"]
        assert abs(sim["no_crew_here"]["mean"] - sim["crew_here"]["mean"] - sim["difference_cells"]) < 0.02
        assert {b["incident_id"] for b in sim["crew_benefit_by_incident"]} == set(reports)
        assert rr["consequences"]["under_response"] and rr["consequences"]["over_response"]
        # noise check and false-alarm figures exist and are bounded
        nz = pr["reliability"]["noise"]
        assert nz["available"] and 0 <= nz["same_side_of_threshold"] <= 1 and nz["range_5_95"][0] <= nz["range_5_95"][1]
        assert 0 < pr["false_alarms"]["precision"] < 1 and 0 < pr["false_alarms"]["false_positive_rate"] < 1
        text = " ".join([*rr["consequences"]["under_response"], *rr["consequences"]["over_response"], rr["why"],
                         pr["anomaly"]["meaning"], *pr["proof"]])
        assert not BANNED.search(text.replace("illegality", "")), BANNED.search(text)


def test_simulation_tradeoff_is_disclosed_when_present(reports):
    for r in reports.values():
        sim = r["recommendation_report"]["consequences"]["simulation"]
        best = max(sim["crew_benefit_by_incident"], key=lambda b: b["cells"])
        here = r["incident_id"]
        if best["incident_id"] != here and best["cells"] > sim["difference_cells"] + 0.5:
            assert sim["tradeoff"] and best["label"] in sim["tradeoff"]


# ----------------------------------------------------------------------------- new actions
def test_monitor_and_escalate_actions_are_recorded(client):
    iid = client.get("/api/incidents").json()["incidents"][0]["id"]
    r = client.post(f"/api/incidents/{iid}/action", json={"action": "CONTINUE_MONITORING", "reason": "Review on next detection"})
    assert r.status_code == 200 and r.json()["incident_status"] in ("Monitoring", "Unattended — waiting")
    r = client.post(f"/api/incidents/{iid}/action", json={"action": "ESCALATE_COORDINATION", "reason": "Cross-border partner needed"})
    assert r.status_code == 200
    acts = [a["action"] for a in client.get("/api/actions").json()["actions"]]
    assert {"CONTINUE_MONITORING", "ESCALATE_COORDINATION"} <= set(acts)


def test_sqlite_migration_widens_old_check_constraint(tmp_path):
    path = tmp_path / "old.db"
    with sqlite3.connect(path) as c:
        c.executescript("""
        CREATE TABLE actions (id INTEGER PRIMARY KEY AUTOINCREMENT, scenario_id TEXT NOT NULL, incident_id TEXT NOT NULL,
            action TEXT NOT NULL CHECK (action IN ('ASSIGN_INSPECTION','REQUEST_RECHECK','DISMISS')), reason TEXT,
            recommendation_at_time TEXT, created_at TEXT NOT NULL);
        INSERT INTO actions (scenario_id, incident_id, action, reason, created_at) VALUES ('S','I','DISMISS','old row','2025-01-01');
        """)
    store = SqliteStore(path)
    rows = store.list_actions(None, True)
    assert len(rows) == 1 and rows[0]["reason"] == "old row"
    store.record_action({"scenario_id": "S", "incident_id": "I", "action": "CONTINUE_MONITORING", "reason": "watch"}, {})
    assert len(store.list_actions(None, True)) == 2
    records.set_records(Records(SqliteStore(tmp_path / "x.db")))
