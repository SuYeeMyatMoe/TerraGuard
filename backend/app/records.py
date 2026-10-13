"""Operational records: coordinator actions (audit), incident status and team assignments.

Backends
  * SQLite (default, local): backend/data/terraguard.db
  * Supabase (deployment): used when SUPABASE_URL and SUPABASE_SECRET_KEY are set in backend/.env.
    The backend is the only database client (PostgREST over httpx with the service-role key). Tables have
    row-level security enabled and no browser policies — see backend/supabase/schema.sql.

If Supabase is configured but unreachable, writes fall back to SQLite (stored_in = "local_fallback") and are
reported as such; `python -m app.records --sync` pushes them later. Detections, the model and simulation
results are NOT stored here — they stay in the files the backend loads.

CLI:
  python -m app.records --archive SCN-20250729   # archive a scenario's actions (never deletes) for a clean demo
  python -m app.records --sync                   # push local fallback rows to Supabase
  python -m app.records --reset-local            # wipe the local SQLite records (development only)
"""
from __future__ import annotations

import json
import os
import re
import sqlite3
import sys
from datetime import datetime, timezone
from typing import Any, Optional, Protocol

import httpx

from ml.config import DATA_DIR

from .runtime import on_vercel
from .team import TEAM

DB_PATH = DATA_DIR / "terraguard.db"

STATUS_TEXT = {
    "ASSIGN_INSPECTION": "Crew assigned",
    "REQUEST_RECHECK": "Recheck requested",
    "CONTINUE_MONITORING": "Monitoring",
    "ESCALATE_COORDINATION": "Coordination requested",
    "DISMISS": "Dismissed",
}
WAITING_STATUS = "Unattended — waiting"
DEFAULT_STATUS = "Awaiting decision"

BASE_COLUMNS = ["scenario_id", "incident_id", "action", "reason", "recommendation_at_time"]
SNAPSHOT_COLUMNS = ["teams", "team_name", "priority_rank", "priority_score", "probability", "followed_recommendation",
                    "reassigned_from", "left_waiting"]


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class RecordError(Exception):
    pass


class RecordStore(Protocol):
    def record_action(self, row: dict, status_updates: dict[str, str]) -> dict: ...
    def list_actions(self, scenario_id: Optional[str], include_archived: bool) -> list[dict]: ...
    def status_map(self) -> dict[str, tuple[str, str]]: ...
    def get_action(self, action_id: int) -> Optional[dict]: ...
    def archive(self, scenario_id: str, incident_ids: list[str]) -> int: ...


# ============================================================================ SQLite
class SqliteStore:
    def __init__(self, path=DB_PATH) -> None:
        self.path = path
        self.init()

    def _conn(self) -> sqlite3.Connection:
        c = sqlite3.connect(self.path)
        c.row_factory = sqlite3.Row
        return c

    def init(self) -> None:
        with self._conn() as c:
            c.executescript("""
            CREATE TABLE IF NOT EXISTS actions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                scenario_id TEXT NOT NULL,
                incident_id TEXT NOT NULL,
                action TEXT NOT NULL CHECK (action IN ('ASSIGN_INSPECTION','REQUEST_RECHECK','DISMISS',
                                                       'CONTINUE_MONITORING','ESCALATE_COORDINATION')),
                reason TEXT,
                recommendation_at_time TEXT,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS incident_status (
                incident_id TEXT PRIMARY KEY,
                status TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS team_assignments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                action_id INTEGER NOT NULL REFERENCES actions(id),
                incident_id TEXT NOT NULL,
                scenario_id TEXT NOT NULL,
                team_name TEXT NOT NULL,
                assigned_at TEXT NOT NULL,
                archived_at TEXT
            );
            """)
            sql = c.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='actions'").fetchone()[0]
            # migrate older databases whose CHECK lacks the new actions (rows preserved)
            if "'DISMISS')" in sql and "CONTINUE_MONITORING" not in sql:
                new_sql = sql.replace("'DISMISS')", "'DISMISS','CONTINUE_MONITORING','ESCALATE_COORDINATION')", 1)
                new_sql = re.sub(r'CREATE TABLE\s+"?actions"?', "CREATE TABLE actions_new", new_sql, count=1)
                c.execute("PRAGMA foreign_keys=OFF")
                c.execute(new_sql)
                c.execute("INSERT INTO actions_new SELECT * FROM actions")
                c.execute("DROP TABLE actions")
                c.execute("ALTER TABLE actions_new RENAME TO actions")
            have = {r["name"] for r in c.execute("PRAGMA table_info(actions)")}
            extra = {"teams": "INTEGER", "team_name": "TEXT", "priority_rank": "INTEGER", "priority_score": "REAL", "probability": "REAL",
                     "followed_recommendation": "INTEGER", "reassigned_from": "TEXT", "left_waiting": "TEXT",
                     "archived_at": "TEXT", "stored_in": "TEXT DEFAULT 'sqlite'", "remote_id": "INTEGER",
                     "fallback_reason": "TEXT"}
            for col, typ in extra.items():
                if col not in have:
                    c.execute(f"ALTER TABLE actions ADD COLUMN {col} {typ}")

    @staticmethod
    def _row(r: sqlite3.Row) -> dict:
        d = dict(r)
        if d.get("left_waiting"):
            d["left_waiting"] = json.loads(d["left_waiting"])
        if d.get("followed_recommendation") is not None:
            d["followed_recommendation"] = bool(d["followed_recommendation"])
        return d

    def record_action(self, row: dict, status_updates: dict[str, str], stored_in: str = "sqlite",
                      fallback_reason: str | None = None) -> dict:
        ts = row.get("created_at") or now()
        with self._conn() as c:  # one transaction: audit row + assignment + status upserts
            cur = c.execute(
                "INSERT INTO actions (scenario_id, incident_id, action, reason, recommendation_at_time, created_at, "
                "team_name, priority_rank, priority_score, probability, followed_recommendation, reassigned_from, "
                "left_waiting, stored_in, fallback_reason, teams) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (row["scenario_id"], row["incident_id"], row["action"], row.get("reason"), row.get("recommendation_at_time"),
                 ts, row.get("team_name"), row.get("priority_rank"), row.get("priority_score"), row.get("probability"),
                 None if row.get("followed_recommendation") is None else int(row["followed_recommendation"]),
                 row.get("reassigned_from"), json.dumps(row["left_waiting"]) if row.get("left_waiting") is not None else None,
                 stored_in, fallback_reason, row.get("teams")))
            aid = cur.lastrowid
            if row["action"] == "ASSIGN_INSPECTION":
                c.execute("INSERT INTO team_assignments (action_id, incident_id, scenario_id, team_name, assigned_at) "
                          "VALUES (?,?,?,?,?)", (aid, row["incident_id"], row["scenario_id"], row["team_name"], ts))
            for iid, status in status_updates.items():
                c.execute("INSERT INTO incident_status (incident_id, status, updated_at) VALUES (?,?,?) "
                          "ON CONFLICT(incident_id) DO UPDATE SET status=excluded.status, updated_at=excluded.updated_at",
                          (iid, status, ts))
            out = c.execute("SELECT * FROM actions WHERE id=?", (aid,)).fetchone()
        return self._row(out)

    def list_actions(self, scenario_id: Optional[str] = None, include_archived: bool = False) -> list[dict]:
        q, args = "SELECT * FROM actions WHERE 1=1", []
        if scenario_id:
            q += " AND scenario_id=?"
            args.append(scenario_id)
        if not include_archived:
            q += " AND archived_at IS NULL"
        q += " ORDER BY id DESC LIMIT 300"
        with self._conn() as c:
            return [self._row(r) for r in c.execute(q, args)]

    def status_map(self) -> dict[str, tuple[str, str]]:
        with self._conn() as c:
            return {r["incident_id"]: (r["status"], r["updated_at"]) for r in c.execute("SELECT * FROM incident_status")}

    def get_action(self, action_id: int) -> Optional[dict]:
        with self._conn() as c:
            r = c.execute("SELECT * FROM actions WHERE id=?", (action_id,)).fetchone()
        return self._row(r) if r else None

    def archive(self, scenario_id: str, incident_ids: list[str]) -> int:
        ts = now()
        with self._conn() as c:
            n = c.execute("UPDATE actions SET archived_at=? WHERE scenario_id=? AND archived_at IS NULL",
                          (ts, scenario_id)).rowcount
            c.execute("UPDATE team_assignments SET archived_at=? WHERE scenario_id=? AND archived_at IS NULL",
                      (ts, scenario_id))
            c.executemany("DELETE FROM incident_status WHERE incident_id=?", [(i,) for i in incident_ids])
        return n

    def pending_sync(self) -> list[dict]:
        with self._conn() as c:
            return [self._row(r) for r in c.execute(
                "SELECT * FROM actions WHERE stored_in='local_fallback' AND remote_id IS NULL ORDER BY id")]

    def mark_synced(self, local_id: int, remote_id: int) -> None:
        with self._conn() as c:
            c.execute("UPDATE actions SET remote_id=? WHERE id=?", (remote_id, local_id))

    def reset_local(self) -> None:
        with self._conn() as c:
            c.executescript("DELETE FROM team_assignments; DELETE FROM actions; DELETE FROM incident_status;")


# ============================================================================ Supabase
class SupabaseStore:
    """PostgREST client using the service-role (secret) key. Never exposed to the browser."""

    def __init__(self, url: str, key: str, transport: httpx.BaseTransport | None = None, timeout: float = 6.0) -> None:
        self.base = url.rstrip("/") + "/rest/v1"
        headers = {"apikey": key, "Content-Type": "application/json"}
        # Modern secret keys are API keys, not JWT bearer tokens.
        if not key.startswith("sb_secret_"):
            headers["Authorization"] = f"Bearer {key}"
        self.client = httpx.Client(timeout=timeout, transport=transport, headers=headers)
        self.snapshot_columns = True  # set False if the optional Part 2 migration has not been applied
        self.teams_column = True  # additive resource-count column may not yet be deployed

    def _req(self, method: str, path: str, **kw) -> Any:
        r = self.client.request(method, self.base + path, **kw)
        if r.status_code >= 400:
            raise RecordError(f"Supabase {method} {path.split('?')[0]} → {r.status_code}: {r.text[:200]}")
        return r.json() if r.content else None

    @staticmethod
    def _norm(d: dict) -> dict:
        d = dict(d)
        d["stored_in"] = "supabase"
        return d

    def _insert_action(self, row: dict) -> dict:
        body = {k: row.get(k) for k in BASE_COLUMNS}
        if row.get("created_at"):
            body["created_at"] = row["created_at"]
        if self.snapshot_columns:
            body.update({k: row.get(k) for k in SNAPSHOT_COLUMNS if k != "teams" or self.teams_column})
        try:
            return self._req("POST", "/actions", json=body, headers={"Prefer": "return=representation"})[0]
        except RecordError as e:
            if self.snapshot_columns and ("PGRST204" in str(e) or "column" in str(e).lower()):
                if self.teams_column and ("'teams'" in str(e) or '"teams"' in str(e)):
                    # Keep the existing rich snapshot when only the new count column is absent.
                    self.teams_column = False
                else:
                    # Part 2 missing: keep the audit row and disclose the incomplete snapshot.
                    self.snapshot_columns = False
                return self._insert_action(row)
            raise

    def record_action(self, row: dict, status_updates: dict[str, str]) -> dict:
        saved = self._insert_action(row)
        if row["action"] == "ASSIGN_INSPECTION":
            self._req("POST", "/team_assignments", json={
                "action_id": saved["id"], "incident_id": row["incident_id"], "scenario_id": row["scenario_id"],
                "team_name": row["team_name"]})
        if status_updates:
            ts = now()
            self._req("POST", "/incident_status?on_conflict=incident_id",
                      json=[{"incident_id": i, "status": s, "updated_at": ts} for i, s in status_updates.items()],
                      headers={"Prefer": "resolution=merge-duplicates"})
        out = self._norm(saved)
        if not self.snapshot_columns or not self.teams_column:
            out = {**{k: row.get(k) for k in SNAPSHOT_COLUMNS}, **out, "snapshot_stored": False}
        return out

    def list_actions(self, scenario_id: Optional[str] = None, include_archived: bool = False) -> list[dict]:
        q = "/actions?select=*&order=id.desc&limit=300"
        if scenario_id:
            q += f"&scenario_id=eq.{scenario_id}"
        if not include_archived and self.snapshot_columns:
            q += "&archived_at=is.null"
        return [self._norm(r) for r in self._req("GET", q)]

    def status_map(self) -> dict[str, tuple[str, str]]:
        return {r["incident_id"]: (r["status"], r["updated_at"]) for r in self._req("GET", "/incident_status?select=*")}

    def get_action(self, action_id: int) -> Optional[dict]:
        rows = self._req("GET", f"/actions?select=*&id=eq.{int(action_id)}")
        return self._norm(rows[0]) if rows else None

    def archive(self, scenario_id: str, incident_ids: list[str]) -> int:
        ts = now()
        rows = self._req("PATCH", f"/actions?scenario_id=eq.{scenario_id}&archived_at=is.null",
                         json={"archived_at": ts}, headers={"Prefer": "return=representation"}) or []
        self._req("PATCH", f"/team_assignments?scenario_id=eq.{scenario_id}&archived_at=is.null", json={"archived_at": ts})
        if incident_ids:
            self._req("DELETE", f"/incident_status?incident_id=in.({','.join(incident_ids)})")
        return len(rows)

    def ping(self) -> bool:
        try:
            self._req("GET", "/actions?select=id&limit=1")
            return True
        except Exception:
            return False


# ============================================================================ facade
class Records:
    """Chooses Supabase when configured, SQLite otherwise; falls back to SQLite (flagged) if Supabase fails.

    On Vercel the local SQLite file is not writable, so fallback is disabled and missing remote
    writes raise RecordError.
    """

    def __init__(self, local: SqliteStore | None, remote: SupabaseStore | None = None,
                 allow_sqlite_fallback: bool | None = None) -> None:
        self.local = local
        self.remote = remote
        self.last_error: str | None = None
        self.allow_sqlite_fallback = (local is not None) if allow_sqlite_fallback is None else bool(allow_sqlite_fallback and local)

    @property
    def backend(self) -> str:
        if not self.remote:
            return "sqlite" if self.local is not None else "unavailable"
        if self.last_error:
            return "sqlite_fallback" if self.allow_sqlite_fallback else "unavailable"
        return "supabase"

    def _remote_call(self, fn, *a, **kw):
        try:
            out = fn(*a, **kw)
            self.last_error = None
            return out, None
        except (RecordError, httpx.HTTPError, ValueError, KeyError, IndexError) as e:
            self.last_error = str(e)[:300]
            return None, self.last_error

    def record_action(self, row: dict, status_updates: dict[str, str]) -> dict:
        if self.remote:
            out, err = self._remote_call(self.remote.record_action, row, status_updates)
            if out is not None:
                return out
            if not self.allow_sqlite_fallback:
                raise RecordError(err or "Operational records are unavailable.")
            return self.local.record_action(row, status_updates, stored_in="local_fallback", fallback_reason=err)
        if self.local is None:
            raise RecordError("Operational records are unavailable.")
        return self.local.record_action(row, status_updates)

    def list_actions(self, scenario_id: Optional[str] = None, include_archived: bool = False) -> list[dict]:
        if self.remote:
            rows, err = self._remote_call(self.remote.list_actions, scenario_id, include_archived)
            pending = []
            if self.local is not None:
                pending = [r for r in self.local.pending_sync()
                           if (not scenario_id or r["scenario_id"] == scenario_id) and (include_archived or not r.get("archived_at"))]
            if rows is not None:
                return sorted(rows + pending, key=lambda r: r["created_at"], reverse=True)
            if not self.allow_sqlite_fallback:
                raise RecordError(err or "Operational records are unavailable.")
        if self.local is None:
            raise RecordError("Operational records are unavailable.")
        return self.local.list_actions(scenario_id, include_archived)

    def status_map(self) -> dict[str, tuple[str, str]]:
        if self.remote:
            m, err = self._remote_call(self.remote.status_map)
            if m is not None:
                return m
            if not self.allow_sqlite_fallback:
                raise RecordError(err or "Operational records are unavailable.")
        if self.local is None:
            raise RecordError("Operational records are unavailable.")
        return self.local.status_map()

    def get_action(self, action_id: int, stored_in: str | None = None) -> Optional[dict]:
        if self.remote and stored_in != "local_fallback":
            r, _ = self._remote_call(self.remote.get_action, action_id)
            if r is not None:
                return r
        if self.local is None:
            return None
        return self.local.get_action(action_id)

    def archive(self, scenario_id: str, incident_ids: list[str]) -> int:
        n = 0 if self.local is None else self.local.archive(scenario_id, incident_ids)
        if self.remote:
            out, err = self._remote_call(self.remote.archive, scenario_id, incident_ids)
            if err:
                raise RecordError(err)
            n += out or 0
        return n

    def sync(self) -> int:
        if not self.remote:
            raise RecordError("Supabase is not configured")
        pushed = 0
        for r in self.local.pending_sync():
            status = {r["incident_id"]: STATUS_TEXT[r["action"]]}
            saved = self.remote.record_action(r, status)
            self.local.mark_synced(r["id"], saved["id"])
            pushed += 1
        return pushed

    def health(self) -> dict:
        if self.local is not None:
            with self.local._conn() as c:
                c.execute("SELECT id FROM actions LIMIT 1").fetchone()
        info = {"backend": self.backend, "supabase_configured": bool(self.remote), "available": True}
        if self.remote:
            info["supabase_reachable"] = self.remote.ping()
            self.last_error = None if info["supabase_reachable"] else "Supabase is unreachable"
            info["backend"] = self.backend
            if not info["supabase_reachable"] and not self.allow_sqlite_fallback:
                info["available"] = False
        elif self.local is None:
            info["available"] = False
        return info


def team_state(actions: list[dict]) -> dict:
    """Crew state from the (non-archived) action history, newest first.

    The crew is committed to the incident of the latest ASSIGN_INSPECTION, unless a LATER recheck or dismissal of
    that same incident released it.
    """
    released: set[str] = set()
    for a in actions:  # newest first
        if a["action"] in ("REQUEST_RECHECK", "DISMISS"):
            released.add(a["incident_id"])
        elif a["action"] == "ASSIGN_INSPECTION":
            if a["incident_id"] in released:
                return {**TEAM, "status": "available", "assigned_incident_id": None, "since": None,
                        "released_from": a["incident_id"], "action_id": None}
            return {**TEAM, "name": a.get("team_name") or TEAM["name"], "status": "assigned", "assigned_incident_id": a["incident_id"], "since": a["created_at"],
                    "stored_in": a.get("stored_in"),
                    "action_id": a["id"]}
    return {**TEAM, "status": "available", "assigned_incident_id": None, "since": None, "action_id": None}


_records: Records | None = None


def configured_remote() -> SupabaseStore | None:
    url = os.getenv("SUPABASE_URL", "").strip()
    key = (os.getenv("SUPABASE_SECRET_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    return SupabaseStore(url, key) if url and key else None


def get() -> Records:
    global _records
    if _records is None:
        remote = configured_remote()
        if on_vercel():
            _records = Records(None, remote, allow_sqlite_fallback=False)
        else:
            _records = Records(SqliteStore(), remote)
    return _records


def set_records(r: Records) -> None:
    """Test hook: inject a Records instance (e.g. temp SQLite + mocked Supabase transport)."""
    global _records
    _records = r


if __name__ == "__main__":
    import ml.config  # noqa: F401  (loads backend/.env)
    rec = get()
    if "--sync" in sys.argv:
        print(f"pushed {rec.sync()} local fallback row(s) to Supabase")
    elif "--archive" in sys.argv:
        scen = sys.argv[sys.argv.index("--archive") + 1]
        from .service import store
        s = store().scenario(scen)
        print(f"archived {rec.archive(scen, [i['incident_id'] for i in s['incidents']])} action row(s) for {scen}")
    elif "--reset-local" in sys.argv:
        rec.local.reset_local()
        print("local SQLite records cleared")
    else:
        print(__doc__)
