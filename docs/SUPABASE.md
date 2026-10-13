# Operational persistence in Supabase

> Integration note (2026-10-10): current decision and crew endpoints use `app.records` and `backend/supabase/schema.sql`, as documented in the README. This document describes the earlier strict RPC adapter retained for compatibility; its migration does not replace the current decision-snapshot schema.

FastAPI is the only Supabase client. The frontend continues to call `/api/*` through the existing Next.js proxy; it has no Supabase dependency or credentials.

| Record | Storage |
|---|---|
| Admin decisions / audit history | public.actions |
| Latest incident status | public.incident_status |
| Optional named team assignment linked to an action | public.team_assignments |
| AI briefing cache and logs | backend/data/terraguard.db, ai_briefs only |
| Incident detections, features, model, simulation inputs and saved evaluation | Existing backend files |

## Setup

The connected project used for this change is `escaegvzxeotbciyyzec` (moha-r's Project). Its initially empty schema received migration `20261010084842_operational_records.sql` through the Supabase plugin. For another project, apply that migration through the Supabase SQL editor or your migration pipeline before starting FastAPI. Do not apply it a second time to this project.

On Vercel this store is required (no SQLite). Set the same names as Production/Preview secrets; see [DEPLOY.md](DEPLOY.md).

Set these names in the ignored `backend/.env`:

```dotenv
SUPABASE_URL=https://escaegvzxeotbciyyzec.supabase.co
SUPABASE_SECRET_KEY=
```

Copy a `sb_secret_…` key from [project Settings → API Keys](https://supabase.com/dashboard/project/escaegvzxeotbciyyzec/settings/api-keys). A legacy service_role JWT is also accepted in SUPABASE_SECRET_KEY. A `sb_publishable_…` or anon key cannot access these records and is rejected by the backend. Never put the secret in frontend env, NEXT_PUBLIC variables, Git, or chat. Restart the backend after changing credentials; the client is cached per process.

```bash
cd backend
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8010
```

On Windows use `.venv/Scripts/python`. Startup validates configuration. Remote connectivity or permission errors produce a sanitized HTTP 503, not a SQLite fallback. The user explicitly requested no login page, so the existing local demo API access model is retained. Frontend `dev` and `start` scripts bind to `127.0.0.1`, matching the backend command above. There is no end-user authentication on the admin endpoints; RLS protects direct database access, not callers of FastAPI. Public or LAN deployment needs a separate access boundary and is outside this local setup.

## Transaction and permissions

`app.db.record_action` sends exactly one POST to `/rest/v1/rpc/record_action`. The SECURITY INVOKER function inserts the audit record, upserts the status, and inserts an optional assignment in one transaction. An advisory transaction lock serializes concurrent decisions about the same incident before allocating audit IDs. All related timestamps use the same server time. Invalid writes roll back the entire transaction.

RLS is enabled on all three tables and there are no browser policies. Table/sequence grants to PUBLIC, anon and authenticated are revoked; RPC EXECUTE is granted only to service_role. The service gets only the privileges needed to read and write these records. Modern secret keys use the apikey header; legacy service_role JWTs additionally use Authorization: Bearer.

Supabase's [RLS enabled without policies advisor](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) reports three informational notices. This is deliberate for these server-only tables. Do not add permissive policies to suppress the notices. Security and performance advisors reported no warnings or errors for this migration.

## Named teams

Existing clients can keep sending only action and reason. An optional name adds an assignment:

```json
{"action":"ASSIGN_INSPECTION","team_name":"Team Alpha","teams":1}
```

The name must be nonblank, trimmed, and at most 120 characters. It is invalid for REQUEST_RECHECK or DISMISS. The response remains the existing `{action, incident_status}` contract; the assignment refers to `action.id`. This does not add a named-team frontend selector, team roster, capacity tracking, or a current-team read endpoint. `teams` remains the available count (0–3) used by the prediction and simulation code. Assignment rows are historical records; later recheck/dismiss actions update status and do not erase the assignment history.

## Verification and existing data

```bash
cd backend
.venv/bin/python -m pytest tests -q
```

Tests use a temporary SQLite cache and an httpx MockTransport. They never reset or mutate a real Supabase project, even when backend/.env has live credentials. `supabase/tests/operational_records.sql` verifies transactions, rollback, status upserts and browser privilege denial against Postgres. Run it through the SQL editor or Supabase plugin; it ends in ROLLBACK and leaves no test records (identity sequences may advance).

Validation: 41 backend tests passed. The SQL assertions passed on the connected project, and a real REST request with the project's publishable key was denied for all three tables and the RPC (Postgres permission error 42501). With the backend secret configured, FastAPI successfully read statuses/audit records and wrote a decision with a named assignment through the live RPC. The audit entry and status remained available through a new Supabase client and a freshly loaded file-backed Store. This test used isolated verification incident/scenario IDs in memory, without changing the committed incident files. The plugin verified the assignment linkage and shared timestamps, then removed only these test records. All operational tables were empty after cleanup.

After configuring the secret, use the unchanged action API, restart FastAPI, and check GET `/api/actions` and GET `/api/incidents` to verify persistence. Timeout errors are not automatically retried, because a write may already have committed; inspect the audit log before resubmitting.

This checkout had no pre-existing SQLite database, so there were no local operational records to import. On an installation with existing actions/statuses, back up its database and import those records before switching the backend. Existing SQLite tables are not deleted, but they are no longer read for operational state. If action IDs are preserved during an import, advance the identity sequence past imported IDs and respect action_id references. The local ai_briefs cache continues to work.

The former `python -m app.db --reset` command now refuses to delete cloud audit history. Use a separate test project or an explicit reviewed database maintenance operation for resets.

Review fixes verified on 2026-10-10: 45 backend tests and 4 frontend regression tests pass. Health now checks database read readiness (200/ready or 503/degraded). Simulations are independent of operational database reads. The frontend passes `teams` (0–3) with each decision, so the backend records a recommendation using the selected count; older clients still default to one team. Audit loading, errors and Retry are visible in the notification list. Live read checks and transactional SQL assertions passed again without leaving records. See [review disposition](REVIEW_2026-10-10_AR.md) for dependency and access limitations.
