"""Minimal in-memory PostgREST emulation for the calls app/records.py makes (used with httpx.MockTransport)."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from urllib.parse import parse_qsl, unquote

import httpx


class FakeSupabase:
    def __init__(self, snapshot_columns: bool = True, teams_column: bool = True) -> None:
        self.tables: dict[str, list[dict]] = {"actions": [], "incident_status": [], "team_assignments": []}
        self.ids = {"actions": 0, "team_assignments": 0}
        self.fail = False
        self.snapshot_columns = snapshot_columns
        self.teams_column = teams_column
        self.requests: list[tuple[str, str]] = []

    def transport(self) -> httpx.MockTransport:
        return httpx.MockTransport(self.handle)

    @staticmethod
    def _match(row: dict, filters: list[tuple[str, str]]) -> bool:
        for col, cond in filters:
            op, _, val = cond.partition(".")
            v = row.get(col)
            if op == "eq" and str(v) != val:
                return False
            if op == "is" and val == "null" and v is not None:
                return False
            if op == "in" and str(v) not in val.strip("()").split(","):
                return False
        return True

    def handle(self, req: httpx.Request) -> httpx.Response:
        table = req.url.path.split("/rest/v1/")[1]
        self.requests.append((req.method, table))
        if self.fail:
            return httpx.Response(503, text="service unavailable")
        params = [(k, unquote(v)) for k, v in parse_qsl(req.url.query.decode())]
        filters = [(k, v) for k, v in params if k not in ("select", "order", "limit", "on_conflict")]
        rows = self.tables[table]
        now = datetime.now(timezone.utc).isoformat()
        if req.method == "GET":
            out = [r for r in rows if self._match(r, filters)]
            if ("order", "id.desc") in params:
                out = sorted(out, key=lambda r: -r["id"])
            return httpx.Response(200, json=out)
        body = json.loads(req.content) if req.content else None
        if req.method == "POST":
            items = body if isinstance(body, list) else [body]
            if table == "actions" and not self.snapshot_columns and any("left_waiting" in i for i in items):
                return httpx.Response(400, json={"code": "PGRST204", "message": "Could not find the 'left_waiting' column"})
            if table == "actions" and not self.teams_column and any("teams" in i for i in items):
                return httpx.Response(400, json={"code": "PGRST204", "message": "Could not find the 'teams' column"})
            created = []
            for it in items:
                if table == "incident_status":
                    rows[:] = [r for r in rows if r["incident_id"] != it["incident_id"]]
                    rows.append(dict(it))
                    created.append(it)
                    continue
                self.ids[table] += 1
                rec = {"id": self.ids[table], **it}
                rec.setdefault("created_at" if table == "actions" else "assigned_at", now)
                rec.setdefault("archived_at", None)
                rows.append(rec)
                created.append(rec)
            return httpx.Response(201, json=created)
        if req.method == "PATCH":
            hit = [r for r in rows if self._match(r, filters)]
            for r in hit:
                r.update(body)
            return httpx.Response(200, json=hit)
        if req.method == "DELETE":
            self.tables[table] = [r for r in rows if not self._match(r, filters)]
            return httpx.Response(204)
        return httpx.Response(405)
