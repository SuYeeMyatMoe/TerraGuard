import base64
import json
import sqlite3

import httpx
import pytest


def test_record_action_uses_one_transactional_rpc(operational_store):
    store, requests = operational_store
    row = store.record_action("S1", "I1", "ASSIGN_INSPECTION", None, "INSPECT", "Alpha")
    assert row["id"] == 1 and row["incident_id"] == "I1"
    assert len(requests) == 1
    req = requests[0]
    assert req.method == "POST" and req.url.path == "/rest/v1/rpc/record_action"
    assert json.loads(req.content) == dict(p_scenario_id="S1", p_incident_id="I1", p_action="ASSIGN_INSPECTION",
                                         p_reason=None, p_recommendation="INSPECT", p_team_name="Alpha")
    assert req.headers["apikey"] == "sb_secret_test"
    assert "authorization" not in req.headers


def test_audit_and_status_are_read_from_supabase(operational_store):
    store, requests = operational_store
    first = store.record_action("S1", "I1", "REQUEST_RECHECK", None, "RECHECK")
    second = store.record_action("S1", "I1", "DISMISS", "Reviewed", "MONITOR")
    assert store.list_actions(1) == [second]
    assert requests[-1].url.params["order"] == "id.desc"
    assert store.get_action(first["id"]) == first
    assert store.get_action(99) is None
    assert store.status_map() == {"I1": ("Dismissed", second["created_at"])}


def test_status_map_pages_past_api_row_limit():
    from app.operational_store import SupabaseOperations
    rows = [dict(incident_id=f"I{i:04}", status="Dismissed", updated_at="2026-10-10") for i in range(1001)]
    calls = []
    def handle(req):
        calls.append(req)
        after = req.url.params.get("incident_id", "gt.").removeprefix("gt.")
        return httpx.Response(200, json=[r for r in rows if r["incident_id"] > after][:1000])
    with SupabaseOperations("https://project.supabase.co", "sb_secret_test", transport=httpx.MockTransport(handle)) as store:
        assert len(store.status_map()) == 1001
    assert len(calls) == 3
    assert calls[1].url.params["incident_id"] == "gt.I0999"


def test_status_map_respects_a_smaller_project_row_cap():
    from app.operational_store import SupabaseOperations
    rows = [dict(incident_id=f"I{i}", status="Dismissed", updated_at="2026-10-10") for i in range(5)]
    def handle(req):
        after = req.url.params.get("incident_id", "gt.").removeprefix("gt.")
        return httpx.Response(200, json=[r for r in rows if r["incident_id"] > after][:2])
    with SupabaseOperations("https://project.supabase.co", "sb_secret_test", transport=httpx.MockTransport(handle)) as store:
        assert len(store.status_map()) == 5


@pytest.mark.parametrize("url,key", [("", ""), ("https://project.supabase.co", ""), ("", "sb_secret_test"),
                                     ("https://project.supabase.co", "sb_publishable_bad"),
                                     ("https://user:pass@project.supabase.co", "sb_secret_test")])
def test_configuration_rejects_missing_or_public_credentials(url, key):
    from app.operational_store import SupabaseOperations
    with pytest.raises(ValueError, match="SUPABASE"):
        SupabaseOperations(url, key)


def test_legacy_service_role_key_uses_bearer_header():
    from app.operational_store import SupabaseOperations
    payload = base64.urlsafe_b64encode(json.dumps({"role": "service_role"}).encode()).decode().rstrip("=")
    key = f"eyJheader.{payload}.signature"
    def handle(req):
        assert req.headers["apikey"] == key
        assert req.headers["authorization"] == f"Bearer {key}"
        return httpx.Response(200, json=[])
    with SupabaseOperations("https://project.supabase.co", key, transport=httpx.MockTransport(handle)) as store:
        assert store.list_actions() == []


@pytest.mark.parametrize("failure", ["http", "timeout", "invalid_json"])
def test_remote_failure_has_no_local_fallback_or_secret_in_error(failure):
    from app.operational_store import OperationalStoreError, SupabaseOperations
    calls = []
    def handle(req):
        calls.append(req)
        if failure == "timeout":
            raise httpx.ReadTimeout("sb_secret_test", request=req)
        if failure == "invalid_json":
            return httpx.Response(200, text="sb_secret_test")
        return httpx.Response(401, json={"message": "sb_secret_test"})
    with SupabaseOperations("https://project.supabase.co", "sb_secret_test", transport=httpx.MockTransport(handle)) as store:
        with pytest.raises(OperationalStoreError) as err:
            store.record_action("S1", "I1", "REQUEST_RECHECK", None, "RECHECK")
    assert "sb_secret" not in str(err.value)
    assert len(calls) == 1  # A timed-out write must not be automatically duplicated.


def test_sqlite_retains_only_brief_cache(isolated_db):
    from app import db
    db.record_action("S1", "I1", "REQUEST_RECHECK", None, "RECHECK")
    db.log_brief("I1", "explain", "hash", None, None, "generated", {"text": "Brief"})
    assert db.cached_brief("I1", "explain", "hash") == {"text": "Brief"}
    with sqlite3.connect(db.DB_PATH) as conn:
        tables = {r[0] for r in conn.execute("select name from sqlite_master where type='table'")}
    assert "ai_briefs" in tables
    assert not {"actions", "incident_status", "team_assignments"} & tables


def test_reset_cannot_delete_cloud_history(isolated_db):
    from app import db
    with pytest.raises(RuntimeError, match="Supabase"):
        db.reset()


def test_team_name_cannot_be_silently_discarded_on_non_assignment():
    from app.schemas import ActionRequest
    with pytest.raises(ValueError):
        ActionRequest(action="REQUEST_RECHECK", team_name="Alpha")


def test_legacy_anon_key_is_rejected():
    from app.operational_store import SupabaseOperations
    payload = base64.urlsafe_b64encode(json.dumps({"role": "anon"}).encode()).decode().rstrip("=")
    with pytest.raises(ValueError, match="SUPABASE_SECRET_KEY"):
        SupabaseOperations("https://project.supabase.co", f"eyJheader.{payload}.signature")


def test_factory_requires_backend_environment(monkeypatch):
    from app.operational_store import configured_store
    configured_store.cache_clear()
    monkeypatch.setenv("SUPABASE_URL", "https://project.supabase.co")
    monkeypatch.delenv("SUPABASE_SECRET_KEY", raising=False)
    with pytest.raises(ValueError, match="SUPABASE_SECRET_KEY"):
        configured_store()
