import pytest
from fastapi.testclient import TestClient

from app import records
from app.main import app
from app.records import Records, SqliteStore


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    records.set_records(Records(SqliteStore(tmp_path_factory.mktemp("rec") / "rec.db")))
    with TestClient(app) as c:
        yield c
    records.set_records(None)


def test_incident_to_action_flow(client):
    inc = client.get("/api/incidents").json()
    assert len(inc["incidents"]) == 3
    iid = inc["incidents"][0]["id"]
    p = client.post("/api/predict", json={"incident_id": iid}).json()
    assert 0 <= p["probability"] <= 1 and p["priority"]["recommendation"] in ("INSPECT", "RECHECK", "MONITOR")
    s = client.post("/api/simulate", json={"n_seeds": 3, "steps": 20}).json()
    assert len(s["policies"]["none"]["frames"]) == 21
    assert client.post(f"/api/incidents/{iid}/action", json={"action": "DISMISS"}).status_code == 422
    a = client.post(f"/api/incidents/{iid}/action", json={"action": "REQUEST_RECHECK", "reason": "need a second pass"}).json()
    assert a["incident_status"] == "Recheck requested"
    again = client.get("/api/incidents").json()
    assert next(i for i in again["incidents"] if i["id"] == iid)["status"] == "Recheck requested"


def test_missing_and_unusual_inputs_are_flagged(client):
    iid = client.get("/api/incidents").json()["incidents"][0]["id"]
    p = client.post("/api/predict", json={"incident_id": iid, "overrides": {
        "relative_humidity_2m_min": None, "precip_7d": None, "frp_max": 9000, "prior_7d": 5000}}).json()
    assert "relative_humidity_2m_min" in p["missing_features"]
    assert {"frp_max", "prior_7d"} <= set(p["ood_features"])
    assert p["priority"]["recommendation"] == "RECHECK"


def test_ai_endpoints_never_fail(client):
    iid = client.get("/api/incidents").json()["incidents"][0]["id"]
    for path in ("/api/ai/explain", "/api/ai/field-brief"):
        r = client.post(path, json={"incident_id": iid}).json()
        assert r["status"] in ("generated", "fallback_deterministic")
        assert r["content"]


def test_unknown_incident_404(client):
    assert client.post("/api/predict", json={"incident_id": "NOPE"}).status_code == 404
