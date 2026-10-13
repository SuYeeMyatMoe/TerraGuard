import pytest
from fastapi.testclient import TestClient

from app import records
from app.main import app


@pytest.fixture
def client(isolated_records_and_cache):
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


def test_snapshot_endpoints_are_cdn_cacheable(client):
    evaluation = client.get("/api/evaluation")
    assert evaluation.status_code == 200
    assert "s-maxage=300" in evaluation.headers.get("cache-control", "")
    incidents = client.get("/api/incidents")
    assert incidents.status_code == 200
    assert "no-store" in incidents.headers.get("cache-control", "")
    iid = incidents.json()["incidents"][0]["id"]
    geo = client.get(f"/api/geospatial/{iid}")
    assert geo.status_code == 200
    assert "s-maxage=300" in geo.headers.get("cache-control", "")


def test_named_assignment_is_optional_and_validated(client):
    iid = client.get("/api/incidents").json()["incidents"][0]["id"]
    path = f"/api/incidents/{iid}/action"
    assert client.post(path, json={"action": "REQUEST_RECHECK", "reason": "review", "team_name": "Alpha"}).status_code == 422
    assert client.post(path, json={"action": "ASSIGN_INSPECTION", "reason": "review", "team_name": "  "}).status_code == 422
    assert client.post(path, json={"action": "ASSIGN_INSPECTION", "reason": "review", "team_name": "A" * 121}).status_code == 422
    r = client.post(path, json={"action": "ASSIGN_INSPECTION", "reason": "review", "team_name": "  Alpha  "})
    assert r.status_code == 200
    assert r.json()["incident_status"] == "Crew assigned"
    assert r.json()["action"]["team_name"] == "Alpha"
    assert records.get().get_action(r.json()["action"]["id"])["team_name"] == "Alpha"
    assert r.json()["team"]["name"] == "Alpha"
    unnamed = client.post(path, json={"action": "ASSIGN_INSPECTION", "reason": "default crew"})
    from app.team import TEAM
    assert unnamed.json()["action"]["team_name"] == TEAM["name"]
    assert client.get("/api/actions").json()["actions"][1] == r.json()["action"]


def test_database_outage_returns_sanitized_503(client, monkeypatch):
    from app.operational_store import OperationalStoreError
    def unavailable(*_args, **_kwargs):
        raise OperationalStoreError("secret database details")
    monkeypatch.setattr(records.get(), "list_actions", unavailable)
    response = client.get("/api/actions")
    assert response.status_code == 503
    assert response.json() == {"detail": "Operational records are unavailable. Please try again."}


def test_simulation_does_not_depend_on_operational_database(client, monkeypatch):
    from app.operational_store import OperationalStoreError
    def unavailable():
        raise OperationalStoreError("Unavailable")
    monkeypatch.setattr(records.get(), "status_map", unavailable)
    response = client.post("/api/simulate", json={"steps": 12, "n_seeds": 1})
    assert response.status_code == 200
    assert len(response.json()["policies"]["none"]["frames"]) == 13


def test_health_reports_database_unavailable(client, monkeypatch):
    from app.operational_store import OperationalStoreError
    def unavailable(*_args, **_kwargs):
        raise OperationalStoreError("Unavailable")
    monkeypatch.setattr(records.get(), "health", unavailable)
    response = client.get("/api/health")
    assert response.status_code == 503
    assert response.json()["status"] == "degraded"
    assert response.json()["operational_database"] == {"status": "unavailable"}


def test_audit_recommendation_matches_selected_team_count(client):
    from app.service import store
    iid = next(iid for iid in store().inc_index
               if store().predict(iid, 0)["priority"]["recommendation"] != store().predict(iid, 1)["priority"]["recommendation"])
    expected = store().predict(iid, 0)["priority"]["recommendation"]
    assert expected != store().predict(iid, 1)["priority"]["recommendation"]
    response = client.post(f"/api/incidents/{iid}/action", json={"action": "REQUEST_RECHECK", "reason": "no available resources", "teams": 0})
    assert response.status_code == 200
    assert response.json()["action"]["recommendation_at_time"] == expected
    assert response.json()["action"]["teams"] == 0
    assert records.get().get_action(response.json()["action"]["id"])["teams"] == 0


def test_action_team_count_is_validated(client, current_incident_id):
    iid = current_incident_id
    for teams in (-1, 4):
        assert client.post(f"/api/incidents/{iid}/action", json={"action": "REQUEST_RECHECK", "reason": "review", "teams": teams}).status_code == 422


def test_explicit_coordinator_assignment_survives_records_outage(client, monkeypatch, current_incident_id):
    from app.records import RecordError
    def unavailable(*_args, **_kwargs):
        raise RecordError("Unavailable")
    monkeypatch.setattr(records.get(), "list_actions", unavailable)
    iid = current_incident_id
    response = client.post("/api/simulate", json={"steps": 12, "n_seeds": 1, "coordinator_assignment": iid})
    assert response.status_code == 200
    assert response.json()["coordinator_assignment"] == iid
    assert response.json()["policies"]["coordinator"]["assigned"] == [iid]


def test_default_simulation_has_no_coordinator_during_records_outage(client, monkeypatch):
    from app.records import RecordError
    def unavailable(*_args, **_kwargs):
        raise RecordError("Unavailable")
    monkeypatch.setattr(records.get(), "list_actions", unavailable)
    response = client.post("/api/simulate", json={"steps": 12, "n_seeds": 1})
    assert response.status_code == 200
    assert response.json()["coordinator_assignment"] is None
    assert "coordinator" not in response.json()["policies"]


def test_sqlite_health_does_not_require_legacy_supabase(client, monkeypatch):
    from app import db
    def unavailable():
        raise AssertionError("Legacy RPC backend must not be consulted")
    monkeypatch.setattr(db, "_operations", unavailable)
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["record_backend"] == "sqlite"
    assert response.json()["operational_database"] == {"status": "ready"}


def test_health_handles_records_factory_failure_without_retry(client, monkeypatch):
    import sqlite3
    calls = []
    def unavailable():
        calls.append(True)
        raise sqlite3.OperationalError("private database path")
    monkeypatch.setattr(records, "get", unavailable)
    response = client.get("/api/health")
    assert response.status_code == 503
    assert response.json()["record_backend"] == "unavailable"
    assert "private database path" not in response.text
    assert len(calls) == 1


def test_geospatial_does_not_read_operational_records(client, monkeypatch, current_incident_id):
    from app import geospatial
    def unavailable():
        raise AssertionError("Records must not be read for geographic context")
    monkeypatch.setattr(records.get(), "status_map", unavailable)
    monkeypatch.setattr(geospatial, "context", lambda inc: {"incident_id": inc["id"]})
    response = client.get(f"/api/geospatial/{current_incident_id}")
    assert response.status_code == 200
    assert response.json() == {"incident_id": current_incident_id}
