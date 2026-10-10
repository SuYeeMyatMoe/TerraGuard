"""Local AI cache and compatibility facade for the independent legacy RPC client.

Current application operational records use app.records. Cache initialization must
not require the legacy Supabase backend to be configured.
"""
from __future__ import annotations

import json
import sqlite3
import sys
from datetime import datetime, timezone

from ml.config import DATA_DIR

from .operational_store import configured_store as _operations

DB_PATH = DATA_DIR / "terraguard.db"

STATUS_TEXT = {
    "ASSIGN_INSPECTION": "Inspection assigned",
    "REQUEST_RECHECK": "Recheck requested",
    "DISMISS": "Dismissed",
}
DEFAULT_STATUS = "Awaiting review"


def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    return c


def init() -> None:
    with _conn() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS ai_briefs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            incident_id TEXT NOT NULL,
            kind TEXT NOT NULL,
            evidence_hash TEXT NOT NULL,
            provider TEXT,
            model TEXT,
            status TEXT NOT NULL,
            payload TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS ix_briefs ON ai_briefs(incident_id, kind, evidence_hash);
        """)


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def record_action(scenario_id: str, incident_id: str, action: str, reason: str | None,
                  recommendation: str | None, team_name: str | None = None) -> dict:
    return _operations().record_action(scenario_id, incident_id, action, reason, recommendation, team_name)


def status_map() -> dict[str, tuple[str, str]]:
    return _operations().status_map()


def list_actions(limit: int = 50) -> list[dict]:
    return _operations().list_actions(limit)


def check_ready() -> None:
    _operations().check_ready()


def get_action(action_id: int) -> dict | None:
    return _operations().get_action(action_id)


def cached_brief(incident_id: str, kind: str, evidence_hash: str) -> dict | None:
    with _conn() as c:
        r = c.execute("SELECT payload FROM ai_briefs WHERE incident_id=? AND kind=? AND evidence_hash=? AND status='generated' "
                      "ORDER BY id DESC LIMIT 1", (incident_id, kind, evidence_hash)).fetchone()
    return json.loads(r["payload"]) if r else None


def log_brief(incident_id: str, kind: str, evidence_hash: str, provider: str | None, model: str | None,
              status: str, payload: dict) -> None:
    with _conn() as c:
        c.execute("INSERT INTO ai_briefs (incident_id, kind, evidence_hash, provider, model, status, payload, created_at) "
                  "VALUES (?,?,?,?,?,?,?,?)", (incident_id, kind, evidence_hash, provider, model, status, json.dumps(payload), now()))


def reset() -> None:
    raise RuntimeError("Operational records now live in Supabase. The local reset command cannot delete cloud audit history.")


if __name__ == "__main__":
    if "--reset" in sys.argv:
        try:
            reset()
        except RuntimeError as exc:
            sys.exit(str(exc))
    init()
