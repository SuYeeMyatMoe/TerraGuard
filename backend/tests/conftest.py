import sys
from pathlib import Path

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


@pytest.fixture
def operational_store():
    import importlib.util
    assert importlib.util.find_spec("app.operational_store"), "Supabase operational store is not implemented"
    from app.operational_store import SupabaseOperations

    records, statuses, requests = [], {}, []

    def handle(request):
        import json
        requests.append(request)
        table = request.url.path.rsplit("/", 1)[-1]
        if request.method == "POST" and table == "record_action":
            p = json.loads(request.content)
            row = dict(id=len(records) + 1, scenario_id=p["p_scenario_id"], incident_id=p["p_incident_id"],
                       action=p["p_action"], reason=p["p_reason"], recommendation_at_time=p["p_recommendation"],
                       created_at="2026-10-10T10:00:00+00:00")
            records.append(row)
            from app.db import STATUS_TEXT
            statuses[row["incident_id"]] = dict(incident_id=row["incident_id"], status=STATUS_TEXT[row["action"]],
                                               updated_at=row["created_at"])
            return httpx.Response(200, json=[row])
        if table == "incident_status":
            after = request.url.params.get("incident_id", "gt.").removeprefix("gt.")
            rows = [statuses[key] for key in sorted(statuses) if key > after]
            return httpx.Response(200, json=rows[:int(request.url.params.get("limit", "1000"))])
        if table == "actions":
            rows = list(reversed(records))
            if "id" in request.url.params:
                rows = [r for r in rows if str(r["id"]) == request.url.params["id"].removeprefix("eq.")]
            return httpx.Response(200, json=rows[:int(request.url.params.get("limit", "50"))])
        raise AssertionError(f"Unexpected operational request: {request.method} {request.url.path}")

    store = SupabaseOperations("https://project.supabase.co", "sb_secret_test", transport=httpx.MockTransport(handle))
    yield store, requests
    store.close()


@pytest.fixture
def isolated_db(tmp_path, monkeypatch, operational_store):
    from app import db
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "terraguard.db")
    monkeypatch.setattr(db, "_operations", lambda: operational_store[0])
    db.init()
