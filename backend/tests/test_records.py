import pytest
from fastapi.testclient import TestClient

from app import records
from app.main import app
from app.records import Records, SqliteStore, SupabaseStore
from app.team import TEAM

from .fake_supabase import FakeSupabase


@pytest.fixture()
def sqlite_client(tmp_path):
    records.set_records(Records(SqliteStore(tmp_path / "rec.db")))
    with TestClient(app) as c:
        yield c
    records.set_records(None)


@pytest.fixture()
def supa(tmp_path):
    fake = FakeSupabase()
    remote = SupabaseStore("https://example.supabase.co", "secret", transport=fake.transport())
    records.set_records(Records(SqliteStore(tmp_path / "rec.db"), remote))
    with TestClient(app) as c:
        yield c, fake
    records.set_records(None)


def _ids(c):
    inc = c.get("/api/incidents").json()
    return inc, [i["id"] for i in inc["incidents"]]


def test_assigning_the_crew_leaves_the_others_unattended(sqlite_client):
    c = sqlite_client
    inc, (a, b, cc) = _ids(c)
    assert inc["team"]["status"] == "available" and inc["record_backend"] == "sqlite"
    r = c.post(f"/api/incidents/{b}/action", json={"action": "ASSIGN_INSPECTION", "reason": "Highest priority"}).json()
    assert r["team"]["assigned_incident_id"] == b and r["team"]["name"] == TEAM["name"]
    assert r["attendance"] == {a: "unattended", b: "assigned", cc: "unattended"}
    act = r["action"]
    assert act["team_name"] == TEAM["name"] and act["reason"] == "Highest priority"
    assert act["recommendation_at_time"] in ("INSPECT", "RECHECK", "MONITOR")
    assert {w["incident_id"] for w in act["left_waiting"]} == {a, cc}
    assert all(0 <= w["probability"] <= 1 for w in act["left_waiting"])
    assert set(act["retrospective"]) == {a, b, cc}
    after = c.get("/api/incidents").json()
    st = {i["id"]: (i["attendance"], i["status"]) for i in after["incidents"]}
    assert st[a] == ("unattended", "Unattended — waiting") and st[b][0] == "assigned"


def test_reassignment_and_release(sqlite_client):
    c = sqlite_client
    _, (a, b, cc) = _ids(c)
    c.post(f"/api/incidents/{a}/action", json={"action": "ASSIGN_INSPECTION", "reason": "first"})
    r = c.post(f"/api/incidents/{b}/action", json={"action": "ASSIGN_INSPECTION", "reason": "moved"}).json()
    assert r["action"]["reassigned_from"] == a
    assert r["attendance"][a] == "unattended"
    # a recheck elsewhere does not move the crew
    r = c.post(f"/api/incidents/{cc}/action", json={"action": "REQUEST_RECHECK", "reason": "need another pass"}).json()
    assert r["team"]["assigned_incident_id"] == b and r["attendance"][cc] == "recheck"
    # dismissing the crew's incident releases the crew
    r = c.post(f"/api/incidents/{b}/action", json={"action": "DISMISS", "reason": "false alarm confirmed"}).json()
    assert r["team"]["status"] == "available"
    assert r["attendance"] == {a: "open", b: "dismissed", cc: "recheck"}
    hist = c.get("/api/actions").json()["actions"]
    assert [h["action"] for h in hist] == ["DISMISS", "REQUEST_RECHECK", "ASSIGN_INSPECTION", "ASSIGN_INSPECTION"]


def test_reason_is_required(sqlite_client):
    c = sqlite_client
    _, (a, _, _) = _ids(c)
    assert c.post(f"/api/incidents/{a}/action", json={"action": "ASSIGN_INSPECTION"}).status_code == 422
    assert c.post(f"/api/incidents/{a}/action", json={"action": "ASSIGN_INSPECTION", "reason": "  "}).status_code == 422


def test_supabase_writes_all_three_tables(supa):
    c, fake = supa
    inc, (a, b, cc) = _ids(c)
    assert inc["record_backend"] == "supabase"
    r = c.post(f"/api/incidents/{b}/action", json={"action": "ASSIGN_INSPECTION", "reason": "go"}).json()
    assert r["action"]["stored_in"] == "supabase"
    assert len(fake.tables["actions"]) == 1 and len(fake.tables["team_assignments"]) == 1
    assert fake.tables["team_assignments"][0]["action_id"] == fake.tables["actions"][0]["id"]
    st = {s["incident_id"]: s["status"] for s in fake.tables["incident_status"]}
    assert st == {b: "Crew assigned", a: "Unattended — waiting", cc: "Unattended — waiting"}
    # crew state is read back from Supabase (not from the local SQLite file)
    assert c.get("/api/incidents").json()["team"]["assigned_incident_id"] == b


def test_supabase_outage_falls_back_to_sqlite_and_syncs(supa):
    c, fake = supa
    _, (a, b, cc) = _ids(c)
    fake.fail = True
    r = c.post(f"/api/incidents/{a}/action", json={"action": "ASSIGN_INSPECTION", "reason": "offline"}).json()
    assert r["action"]["stored_in"] == "local_fallback" and r["record_backend"] == "sqlite_fallback"
    assert fake.tables["actions"] == []
    fake.fail = False
    rows = c.get("/api/actions").json()["actions"]
    assert [x["stored_in"] for x in rows] == ["local_fallback"]  # pending row still visible next to Supabase rows
    assert records.get().sync() == 1
    assert len(fake.tables["actions"]) == 1 and fake.tables["actions"][0]["incident_id"] == a
    assert records.get().local.pending_sync() == []


def test_supabase_without_snapshot_columns_keeps_audit_row(tmp_path):
    fake = FakeSupabase(snapshot_columns=False)
    store = SupabaseStore("https://x.supabase.co", "k", transport=fake.transport())
    row = {"scenario_id": "S", "incident_id": "I", "action": "ASSIGN_INSPECTION", "reason": "r",
           "recommendation_at_time": "INSPECT", "team_name": "Crew", "left_waiting": [], "priority_rank": 1,
           "priority_score": 0.5, "probability": 0.4, "followed_recommendation": True, "reassigned_from": None}
    out = store.record_action(row, {"I": "Crew assigned"})
    assert out["snapshot_stored"] is False and fake.tables["actions"][0]["reason"] == "r"


def test_archive_clears_state_but_keeps_history(sqlite_client):
    c = sqlite_client
    inc, (a, b, cc) = _ids(c)
    c.post(f"/api/incidents/{a}/action", json={"action": "ASSIGN_INSPECTION", "reason": "x"})
    n = records.get().archive(inc["scenario"]["id"], [a, b, cc])
    assert n == 1
    assert c.get("/api/incidents").json()["team"]["status"] == "available"
    assert c.get("/api/actions").json()["actions"] == []
    assert len(c.get("/api/actions?include_archived=true").json()["actions"]) == 1


def test_simulation_adds_coordinator_policy(sqlite_client):
    c = sqlite_client
    _, (a, b, cc) = _ids(c)
    s = c.post("/api/simulate", json={"n_seeds": 3, "steps": 16}).json()
    assert "coordinator" not in s["policies"] and s["coordinator_assignment"] is None
    c.post(f"/api/incidents/{cc}/action", json={"action": "ASSIGN_INSPECTION", "reason": "x"})
    s = c.post("/api/simulate", json={"n_seeds": 3, "steps": 16}).json()
    assert s["coordinator_assignment"] == cc and s["policies"]["coordinator"]["assigned"] == [cc]
    assert "coordinator" in s["comparison"]
