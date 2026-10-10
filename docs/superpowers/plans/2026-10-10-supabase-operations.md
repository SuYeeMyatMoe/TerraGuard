# Supabase Operational Records Implementation Plan

> Execute inline with executing-plans. The user has authorized implementation; project credential entry is the only external dependency.

**Goal:** Persist decisions and statuses in Supabase while preserving the current frontend API and file-backed evidence.

**Architecture:** Keep app.db as a facade. Add an httpx operational store and transactional Postgres RPC. SQLite retains only ai_briefs.

**Tech Stack:** FastAPI, Pydantic, httpx, PostgreSQL 17, Supabase MCP and CLI 2.120.0, pytest.

## 1. Prove adapter and boundary behavior before implementation

- [x] Add backend/tests/test_operational_store.py with transport-level tests for one RPC write, descending audit reads, action lookup, keyset-paginated statuses, missing configuration, secret/legacy headers, HTTP and timeout failures, and local cache separation.
- [x] Add backend/tests/test_api.py cases for optional named teams and generic 503 errors.
- [x] Run tests before implementation; initial fixture assertions identified the absent adapter, and separate tests failed for missing backend delegation and silently discarded team names.

The write contract is:
```python
row = store.record_action("scenario", "incident", "ASSIGN_INSPECTION", None, "INSPECT", "Team A")
assert row["action"] == "ASSIGN_INSPECTION"
# Exactly one POST /rest/v1/rpc/record_action carries p_team_name = Team A.
```

## 2. Implement the adapter and compatible API

- [x] Create backend/app/operational_store.py. Read env once in a cached factory; use apikey for modern secrets, also Bearer Authorization for legacy JWTs. Use a 15-second timeout, no write retries, and a sanitized OperationalStoreError.
- [x] Change backend/app/db.py operational methods to delegate; init creates only ai_briefs and validates env; reset refuses cloud deletion. Keep cached_brief/log_brief intact.
- [x] In backend/app/schemas.py add optional team_name, strip whitespace, reject empty or non-assignment names. In main.py forward team_name and handle OperationalStoreError with a 503 JSON detail.
- [x] Isolate API/persistence tests through temporary DB_PATH and a stateful REST transport; remove destructive db.reset teardown. Existing ML tests do not access operational persistence.
- [x] Re-run the targeted tests, then `.venv/bin/python -m pytest tests -q`: 41 pass. A new failing row-cap test led to pagination through the final empty page, supporting project limits below 1000.

## 3. Apply and verify the database migration

- [x] Generate the migration path with `npx --yes supabase@2.120.0 migration new operational_records`; fill it with the supplied tables, team action index, RLS/revokes/service grants, and SECURITY INVOKER record_action returning SETOF actions.
- [x] Use the Supabase plugin apply_migration on escaegvzxeotbciyyzec. Align the local filename with the actual remote history version 20261010084842.
- [x] Execute SQL in a rolled-back transaction asserting all three records are created together, invalid assignments roll back all writes, repeated actions upsert one status, and anon/authenticated cannot read/write/execute the RPC. Confirm publishable-key REST calls return permission error 42501.
- [x] Run both advisors: only expected informational RLS-without-policy notices; no warnings/errors or performance notices.

## 4. Document and finish verification

- [x] Update backend/.env.example, README.md, docs/API.md, and docs/SUPABASE.md with backend-only setup, RPC permissions, optional named teams, and cloud reset restrictions.
- [x] Create ignored backend/.env with the connected URL and an empty secret only if absent. Ask the operator to enter the secret locally; never print it. The operator supplied a publishable key, which was used only to prove browser denial.
- [ ] When populated, test REST reads and an action through FastAPI against Supabase; remove only the test rows and verify status after a new client/store instance.
- [x] Run the full backend suite (41 pass, two pre-existing on_event deprecation warnings), `git diff --check`, inspect the final diff and branch, and report the remaining credential limitation. Main remains at 20e9049; frontend contains no Supabase credentials or changes.
