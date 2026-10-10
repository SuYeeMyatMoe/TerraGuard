"""SQLite persistence for administrator actions (audit trail), incident status and AI brief logs.

Reset before a demo:  python -m app.db --reset
"""
from __future__ import annotations

import json
import sqlite3
import sys
from datetime import datetime, timezone

from ml.config import DATA_DIR

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
        CREATE TABLE IF NOT EXISTS actions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            scenario_id TEXT NOT NULL,
            incident_id TEXT NOT NULL,
            action TEXT NOT NULL,
            reason TEXT,
            recommendation_at_time TEXT,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS incident_status (
            incident_id TEXT PRIMARY KEY,
            status TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
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


def record_action(scenario_id: str, incident_id: str, action: str, reason: str | None, recommendation: str | None) -> dict:
    ts = now()
    with _conn() as c:
        cur = c.execute(
            "INSERT INTO actions (scenario_id, incident_id, action, reason, recommendation_at_time, created_at) VALUES (?,?,?,?,?,?)",
            (scenario_id, incident_id, action, reason, recommendation, ts))
        c.execute("INSERT INTO incident_status (incident_id, status, updated_at) VALUES (?,?,?) "
                  "ON CONFLICT(incident_id) DO UPDATE SET status=excluded.status, updated_at=excluded.updated_at",
                  (incident_id, STATUS_TEXT[action], ts))
        row = c.execute("SELECT * FROM actions WHERE id=?", (cur.lastrowid,)).fetchone()
    return dict(row)


def status_map() -> dict[str, tuple[str, str]]:
    with _conn() as c:
        return {r["incident_id"]: (r["status"], r["updated_at"]) for r in c.execute("SELECT * FROM incident_status")}


def list_actions(limit: int = 50) -> list[dict]:
    with _conn() as c:
        return [dict(r) for r in c.execute("SELECT * FROM actions ORDER BY id DESC LIMIT ?", (limit,))]


def get_action(action_id: int) -> dict | None:
    with _conn() as c:
        r = c.execute("SELECT * FROM actions WHERE id=?", (action_id,)).fetchone()
    return dict(r) if r else None


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
    with _conn() as c:
        c.executescript("DELETE FROM actions; DELETE FROM incident_status;")


if __name__ == "__main__":
    init()
    if "--reset" in sys.argv:
        reset()
        print("actions and incident statuses cleared")
