# Supabase operational records

The user supplied and authorized this design for implementation on a new Git branch.

## Scope and architecture

FastAPI remains the only database client. Its existing `app.db` facade sends operational reads to Supabase PostgREST using the existing httpx dependency. A service-only, SECURITY INVOKER RPC writes an action, its latest incident status, and an optional named team assignment in one transaction. A per-incident transaction lock serializes competing decisions. Two REST writes would risk partial commits; a direct Postgres connection would introduce unnecessary connection credentials and a new driver.

`actions`, `incident_status`, and `team_assignments` follow the supplied schema. All three enable RLS without browser policies; anon/authenticated/PUBLIC grants are revoked. The RPC is executable only by service_role. File-based incident detection, model, simulation, and evaluation stay unchanged. The AI briefing cache stays in local SQLite.

The existing action API and response remain compatible. An optional `team_name` is accepted only for ASSIGN_INSPECTION, trimmed, and limited to 120 characters. The existing `teams` prediction/simulation parameter still means available team count, never a team name. No frontend changes are required.

## Configuration and failure behavior

`backend/.env` contains SUPABASE_URL and SUPABASE_SECRET_KEY (modern secret key preferred; legacy service_role JWT accepted). No public/anon key is accepted. Missing or partial configuration prevents backend startup with a useful message. Remote errors return a generic 503 without provider payloads or secrets. There is no local operational fallback or automatic write retry. The previous SQLite reset command cannot delete cloud audit history.

The connected project is escaegvzxeotbciyyzec, the account's sole project. Its public schema is empty. This checkout has no pre-existing terraguard.db, so there are no operational records to import. Existing SQLite files on other installations must be backed up and migrated before switching their backend; this change does not delete them.

## Verification

Use isolated temporary SQLite caches and httpx MockTransport for offline tests, never real project credentials. Test RPC request shape, reads, pagination, key handling, 503 failures, optional team validation, cache isolation, and the unchanged API. On Supabase run transaction-scoped SQL proofs for successful writes, constraint-failure rollback, and browser privilege denial; roll back all test records. Run security/performance advisors. After the operator supplies the secret in backend/.env, verify the actual FastAPI-to-REST path without leaving test records.
