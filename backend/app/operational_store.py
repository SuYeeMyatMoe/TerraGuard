"""Backend-only Supabase persistence. Each action is a single transactional RPC."""
from __future__ import annotations

import base64
import json
import os
from functools import lru_cache
from urllib.parse import urlsplit

import httpx


class OperationalStoreError(RuntimeError):
    """Public, sanitized database failure; provider responses must not escape."""


UNAVAILABLE = "Operational records are unavailable. Please try again."


class SupabaseOperations:
    def __init__(self, url: str, key: str, *, transport: httpx.BaseTransport | None = None):
        url, key = url.strip().rstrip("/"), key.strip()
        parsed = urlsplit(url)
        if (not parsed.hostname or parsed.scheme != "https" or parsed.username or parsed.password
                or parsed.path or parsed.query or parsed.fragment):
            raise ValueError("Set SUPABASE_URL to the project's HTTPS API URL in backend/.env.")
        headers = {"apikey": key, "Accept": "application/json"}
        if not key.startswith("sb_secret_"):
            try:
                parts = key.split(".")
                payload = json.loads(base64.urlsafe_b64decode(parts[1] + "=" * (-len(parts[1]) % 4)))
                is_service = len(parts) == 3 and payload.get("role") == "service_role"
            except (ValueError, IndexError, AttributeError, UnicodeDecodeError):
                is_service = False
            if not is_service:
                raise ValueError("Set SUPABASE_SECRET_KEY to a secret or legacy service_role key in backend/.env; public keys are not allowed.")
            headers["Authorization"] = f"Bearer {key}"
        # Modern secret keys go only in apikey; they are not JWT bearer tokens.
        self._client = httpx.Client(base_url=f"{url}/rest/v1/", headers=headers,
                                    timeout=15.0, transport=transport)

    def close(self) -> None:
        self._client.close()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()

    def _request(self, method: str, path: str, **kwargs) -> list[dict]:
        try:
            response = self._client.request(method, path, **kwargs)
            response.raise_for_status()
            rows = response.json()
            if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
                raise ValueError("Expected PostgREST rows")
            return rows
        except (httpx.HTTPError, ValueError):
            # No automatic retry: a timeout may follow a committed write.
            raise OperationalStoreError(UNAVAILABLE) from None

    def record_action(self, scenario_id: str, incident_id: str, action: str, reason: str | None,
                      recommendation: str | None, team_name: str | None = None) -> dict:
        rows = self._request("POST", "rpc/record_action", json={
            "p_scenario_id": scenario_id, "p_incident_id": incident_id, "p_action": action,
            "p_reason": reason, "p_recommendation": recommendation, "p_team_name": team_name,
        })
        if len(rows) != 1:
            raise OperationalStoreError(UNAVAILABLE)
        return rows[0]

    def list_actions(self, limit: int = 50) -> list[dict]:
        return self._request("GET", "actions", params={"select": "*", "order": "id.desc", "limit": max(0, limit)})

    def get_action(self, action_id: int) -> dict | None:
        rows = self._request("GET", "actions", params={"select": "*", "id": f"eq.{action_id}", "limit": 1})
        return rows[0] if rows else None

    def status_map(self) -> dict[str, tuple[str, str]]:
        statuses: dict[str, tuple[str, str]] = {}
        after = None
        # Keyset pages avoid silently truncating statuses at PostgREST's row cap.
        while True:
            params = {"select": "incident_id,status,updated_at", "order": "incident_id.asc", "limit": 1000}
            if after is not None:
                params["incident_id"] = f"gt.{after}"
            rows = self._request("GET", "incident_status", params=params)
            try:
                statuses.update({r["incident_id"]: (r["status"], r["updated_at"]) for r in rows})
                if not rows:
                    return statuses
                after = rows[-1]["incident_id"]
            except KeyError:
                raise OperationalStoreError(UNAVAILABLE) from None


@lru_cache(maxsize=1)
def configured_store() -> SupabaseOperations:
    # ml.config loads backend/.env before app.db uses this factory.
    return SupabaseOperations(os.getenv("SUPABASE_URL", ""), os.getenv("SUPABASE_SECRET_KEY", ""))
