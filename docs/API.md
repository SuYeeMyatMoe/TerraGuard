# API (FastAPI, port 8010; the frontend proxies `/api/*`)

Pydantic contracts live in `backend/app/schemas.py`. `frontend/src/lib/types.ts` mirrors them by hand.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Model version, data source, provider readiness (never key values) |
| GET | `/api/incidents?scenario=` | Replay scenario, 3 incidents (coordinates, observation, PA, weather, status), past-24 h context hotspots, provenance |
| POST | `/api/predict` | `{incident_id, teams, overrides?}` → probability, tree interval, threshold, category, evidence, factors, missing/OOD flags, priority + competing incidents, retrospective label. `overrides` with `null` simulates missing inputs |
| POST | `/api/simulate` | `{scenario_id, teams, response_delay, steps, seed, n_seeds, per_incident{wind_speed, wind_dir_deg, dryness, ignition}}` → plots, per-policy frames/events/metrics, B-vs-C comparison, assumptions |
| POST | `/api/incidents/{id}/action` | `{action: ASSIGN_INSPECTION \| REQUEST_RECHECK \| DISMISS, reason?, team_name?}` (reason required for DISMISS; optional team_name only for ASSIGN_INSPECTION) → audit record + status |
| GET | `/api/actions` | Audit log |
| GET | `/api/evaluation` | Provenance, audit, baseline vs RF (val/test, PR curve, reliability), policy backtest |
| GET | `/api/geospatial/{id}` | Earth Engine context (or `available:false` with a reason) + protected-area GeoJSON with boundary status |
| POST | `/api/ai/explain` | OpenAI incident briefing (validated, cached by evidence hash; deterministic fallback) |
| POST | `/api/ai/field-brief` | Grafilab English field brief (validated; deterministic fallback) |

Frames are encoded as one digit string per plot per step (400 chars, row-major). Cell states: 0 empty · 1 healthy · 2 burning · 3 burned · 4 intervention-affected.

Operational reads and decisions use backend-only Supabase. The response contracts and Next.js API proxy remain unchanged. `team_name` is trimmed, nonblank, at most 120 characters, and creates a named assignment linked to the returned action ID. Omitting it preserves the existing status-only assignment behavior. `teams` still means the number of available teams for predictions and simulations.

An action, its status update, and any named assignment commit together in one Postgres RPC. GET `/api/actions` returns the most recent 50 actions by descending ID. Database outages produce HTTP 503 with `{"detail":"Operational records are unavailable. Please try again."}`; there is no local operational fallback. A timeout can occur after a commit, so check the audit log before retrying a decision. Brief caching remains local SQLite. See [Supabase setup](SUPABASE.md).
