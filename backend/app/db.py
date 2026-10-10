"""Local SQLite cache for AI briefings (not an operational record; never moved to Supabase).

Operational records — actions, incident status, team assignments — live in app/records.py.
"""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone

from ml.config import DATA_DIR

DB_PATH = DATA_DIR / "terraguard.db"


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
