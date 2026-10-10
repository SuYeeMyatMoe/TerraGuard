import pytest
from fastapi.testclient import TestClient

from app import db
from app.main import app


@pytest.fixture
def client(isolated_db):
    with TestClient(app) as c:
        yield c


def test_incident_to_action_flow(client):
    inc = client.get("/api/incidents").json()
    assert len(inc["incidents"]) == 3
    iid = inc["incidents"][0]["id"]
    p = client.post("/api/predict", json={"incident_id": iid}).json()
    assert 0 <= p["probability"] <= 1 and p["priority"]["recommendation"] in ("INSPECT", "RECHECK", "MONITOR")
    s = client.post("/api/simulate", json={"n_seeds": 3, "steps": 20}).json()
    assert len(s["policies"]["none"]["frames"]) == 21
    assert client.post(f"/api/incidents/{iid}/action", json={"action": "DISMISS"}).status_code == 422
    a = client.post(f"/api/incidents/{iid}/action", json={"action": "REQUEST_RECHECK"}).json()
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


def test_named_assignment_is_optional_and_validated(client, operational_store):
    import json
    iid = client.get("/api/incidents").json()["incidents"][0]["id"]
    path = f"/api/incidents/{iid}/action"
    assert client.post(path, json={"action": "REQUEST_RECHECK", "team_name": "Alpha"}).status_code == 422
    assert client.post(path, json={"action": "ASSIGN_INSPECTION", "team_name": "  "}).status_code == 422
    assert client.post(path, json={"action": "ASSIGN_INSPECTION", "team_name": "A" * 121}).status_code == 422
    r = client.post(path, json={"action": "ASSIGN_INSPECTION", "team_name": "  Alpha  "})
    assert r.status_code == 200
    assert r.json()["incident_status"] == "Inspection assigned"
    writes = [q for q in operational_store[1] if q.method == "POST"]
    assert json.loads(writes[-1].content)["p_team_name"] == "Alpha"
    assert client.get("/api/actions").json()["actions"][0] == r.json()["action"]


def test_database_outage_returns_sanitized_503(client, monkeypatch):
    from app.operational_store import OperationalStoreError
    def unavailable():
        raise OperationalStoreError("Operational records are unavailable. Please try again.")
    monkeypatch.setattr(db, "list_actions", unavailable)
    response = client.get("/api/actions")
    assert response.status_code == 503
    assert response.json() == {"detail": "Operational records are unavailable. Please try again."}
