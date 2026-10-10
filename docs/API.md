# API (FastAPI, port 8010; the frontend proxies `/api/*`)

Pydantic contracts live in `backend/app/schemas.py`. `frontend/src/lib/types.ts` mirrors them by hand.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Model version, data source, provider readiness (never key values), database read readiness: 200/ready or 503/degraded |
| GET | `/api/incidents?scenario=` | Replay scenario, 3 incidents (coordinates, observation, PA, weather, status), past-24 h context hotspots, provenance |
| POST | `/api/predict` | `{incident_id, teams, overrides?}` → probability, tree interval, threshold, category, evidence, factors, missing/OOD flags, priority + competing incidents, retrospective label. `overrides` with `null` simulates missing inputs |
| POST | `/api/simulate` | `{scenario_id, teams, response_delay, steps, seed, n_seeds, per_incident{wind_speed, wind_dir_deg, dryness, ignition}}` → plots, per-policy frames/events/metrics, B-vs-C comparison, assumptions |
| POST | `/api/incidents/{id}/action` | `{action: ASSIGN_INSPECTION \| REQUEST_RECHECK \| DISMISS, reason?, team_name?, teams?}` (reason required for DISMISS; optional team_name only for ASSIGN_INSPECTION; teams defaults to 1 and must be 0–3) → audit record + status |
| GET | `/api/actions` | Audit log |
| GET | `/api/evaluation` | Provenance, audit, baseline vs RF (val/test, PR curve, reliability), policy backtest |
| GET | `/api/geospatial/{id}` | Earth Engine context (or `available:false` with a reason) + protected-area GeoJSON with boundary status |
| GET | `/api/earth-engine` | Earth View connection configuration state; no upstream request |
| GET | `/api/earth-engine/{id}?days=30` | Viewport Sentinel-2 RGB/NDVI and separate 1 km statistics; days=14/30/60; optional bbox=west,south,east,north and mode=context|compare |
| GET | `/api/earth-engine/tiles/{handle}/{z}/{x}/{y}` | Authenticated raster proxy for a server-issued handle; PNG/JPEG with matching MIME type, 410 if expired, 422 invalid coordinates, 503 upstream failure |
| POST | `/api/ai/explain` | OpenAI incident briefing (validated, cached by evidence hash; deterministic fallback) |
| POST | `/api/ai/field-brief` | Grafilab English field brief (validated; deterministic fallback) |

Frames are encoded as one digit string per plot per step (400 chars, row-major). Cell states: 0 empty · 1 healthy · 2 burning · 3 burned · 4 intervention-affected.

Operational reads and decisions use backend-only Supabase. The action response and Next.js API proxy remain unchanged. `team_name` is trimmed, nonblank, at most 120 characters, and creates a named assignment linked to the returned action ID. Omitting it preserves the existing status-only assignment behavior. `teams` means the number of available teams for predictions, simulations, and the recommendation recorded with a decision. FastAPI recomputes that recommendation; the frontend sends the selected count, not a recommendation string.

`/api/health` performs a read-only, three-second database probe and adds `operational_database: {status: "ready"}` to successful responses. A failed probe returns HTTP 503, `status: "degraded"`, and `operational_database: {status: "unavailable"}`, while preserving model/provider metadata. This checks read readiness, not write permissions. `/api/predict` and `/api/simulate` use local model/data files and continue to work during operational database outages. `/api/incidents` still needs operational status reads.

An action, its status update, and any named assignment commit together in one Postgres RPC. GET `/api/actions` returns the most recent 50 actions by descending ID. Database outages produce HTTP 503 with `{"detail":"Operational records are unavailable. Please try again."}`; there is no local operational fallback. A timeout can occur after a commit, so check the audit log before retrying a decision. Brief caching remains local SQLite. See [Supabase setup](SUPABASE.md).

Earth View imagery is separate from extracted geospatial context. Metadata states are explicit: ready, no_data, not_configured or unavailable. Requests use a historical UTC window ending at the incident timestamp; statistics/layers are supplementary and never model inputs. Comparison adds retrospective rgb_after/ndvi_after layers and separate dates/statistics, preserving before imagery if after fails. Bbox accepts ordered, finite coordinates anywhere worldwide; analysis spans are limited to 8 degrees in each dimension (422 instructs zooming in). The global basemap is independent of this limit; The frontend starts Earth Engine analysis on NDVI/period/comparison choices, never on ordinary camera movement. Tile bytes use a bounded 10-minute cache with duplicate upstream requests coalesced. Append `&refresh=true` to recreate cached map handles. See [Earth Engine setup and contracts](EARTH_ENGINE.md).
