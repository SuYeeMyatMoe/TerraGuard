# API (FastAPI, port 8010; the frontend proxies `/api/*`)

Pydantic contracts live in `backend/app/schemas.py`. `frontend/src/lib/types.ts` mirrors them by hand.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Model version, data source, provider readiness (never key values), record backend and read readiness: 200/ready or 503/degraded |
| GET | `/api/incidents?scenario=` | Replay scenario, 3 incidents (coordinates, observation, PA, weather, status, `attendance`: assigned/unattended/recheck/dismissed/open), crew state (`team`), `record_backend`, past-24 h context hotspots, provenance |
| POST | `/api/predict` | `{incident_id, teams, overrides?}` → probability, tree interval, threshold, category, evidence, factors, missing/OOD flags, priority + competing incidents, retrospective label. `overrides` with `null` simulates missing inputs |
| POST | `/api/simulate` | `{scenario_id, response_delay, steps, seed, n_seeds, per_incident{…}, coordinator_assignment?}` → plots, per-policy frames/events/metrics, comparison, assumptions. When the crew is assigned (or `coordinator_assignment` is given), a `coordinator` policy ("Your assignment") runs under the same random draws |
| POST | `/api/incidents/{id}/action` | `{action: ASSIGN_INSPECTION \| REQUEST_RECHECK \| DISMISS, reason, teams?, team_name?}`. The reason is required. `ASSIGN_INSPECTION` sends the only crew. The server snapshots the recommendation, rank, score, probability, `left_waiting` and `reassigned_from`, then writes `actions` + `team_assignments` + `incident_status`. Returns the action, crew state, per-incident attendance and `record_backend` |
| GET | `/api/actions?scenario=&include_archived=` | Decision record with full snapshots, `stored_in` (`supabase \| sqlite \| local_fallback`) and the historical outcome per incident (replay only) |
| GET | `/api/evaluation` | Provenance, audit, baseline vs RF (val/test, PR curve, reliability), policy backtest |
| GET | `/api/geospatial/{id}` | Earth Engine context (or `available:false` with a reason) + protected-area GeoJSON with boundary status |
| GET | `/api/earth-engine` | Earth View connection configuration state; no upstream request |
| GET | `/api/earth-engine/{id}?days=30` | Viewport Sentinel-2 RGB/NDVI and separate 1 km statistics; days=14/30/60; optional bbox=west,south,east,north and mode=context|compare |
| GET | `/api/earth-engine/tiles/{handle}/{z}/{x}/{y}` | Authenticated raster proxy for a server-issued handle; PNG/JPEG with matching MIME type, 410 if expired, 422 invalid coordinates, 503 upstream failure |
| POST | `/api/ai/explain` | OpenAI incident briefing (validated, cached by evidence hash; deterministic fallback) |
| POST | `/api/ai/field-brief` | Grafilab English field brief (validated; deterministic fallback) |

Frames are encoded as one digit string per plot per step (400 chars, row-major). Cell states: 0 empty · 1 healthy · 2 burning · 3 burned · 4 intervention-affected.

Current operational endpoints use `app.records`: SQLite locally or Supabase when configured, with labelled local fallback. The older strict RPC adapter in `app.operational_store` and `app.db` remains available for compatibility; it is not the decision-record endpoint backend. Decision reasons are required; optional `teams` is bounded to 0–3 and defaults to 1, and optional `team_name` is trimmed, nonblank, at most 120 characters and restricted to assignments.

Earth View imagery is separate from extracted geospatial context. Metadata states are explicit: ready, no_data, not_configured or unavailable. Requests use a historical UTC window ending at the incident timestamp; statistics/layers are supplementary and never model inputs. Comparison adds retrospective rgb_after/ndvi_after layers and separate dates/statistics, preserving before imagery if after fails. Bbox accepts ordered, finite coordinates anywhere worldwide; analysis spans are limited to 8 degrees in each dimension (422 instructs zooming in). The global basemap is independent of this limit. The frontend prepares reusable before/after period resources with `async_load=true`; camera movement and display controls reuse them. Scientific rasters render from detail zoom 6. Period tile bytes are cached on disk with duplicate upstream requests coalesced; upstream map resources are renewed internally. Append `&refresh=true` to recreate cached map handles. See [Earth Engine setup and contracts](EARTH_ENGINE.md).

### `/api/predict` explanation fields
| Field | Meaning |
|---|---|
| `decision_summary` | One sentence built from verified facts (or the insufficient-evidence sentence). |
| `urgency{tier,label,reasons,rule_based}` | Rule-based tier. Separate from the probability and the priority score. |
| `explained_factors[]` | Top 4 model factors: friendly name, value with units, training-reference comparison, direction, relative influence (0–1) and technical contribution in probability points. |
| `ranking_explanation` | Comparison with the strongest alternative (component differences, drivers, trade-off, resource note, tie/close handling, neighbour for rank ≥ 3, all pairs). |
| `confidence_guidance[]` | Evidence gap → why it matters → verification step. |
| `evidence_limitations[]` | Severity-ranked limitations. |
| `tree_variation{p10,p90,note}` | Variation across trees, **not** a confidence interval. Replaces `interval`. |
| `calibration_note` | Held-out observed follow-up rate for this score band. |
| `trace` | FIRMS rows matched to the cluster (product, version, type, confidence, FRP), weather tile and date, protected-area source, model version, inference time, priority policy version, substituted values. |

`model_limitations` replaces the old `limitations` string list.
