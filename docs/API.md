# API (FastAPI, port 8010; the frontend proxies `/api/*`)

Pydantic contracts live in `backend/app/schemas.py`. `frontend/src/lib/types.ts` mirrors them by hand.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Model version, data source, provider readiness (never key values) |
| GET | `/api/incidents?scenario=` | Replay scenario, 3 incidents (coordinates, observation, PA, weather, status, `attendance`: assigned/unattended/recheck/dismissed/open), crew state (`team`), `record_backend`, past-24 h context hotspots, provenance |
| POST | `/api/predict` | `{incident_id, teams, overrides?}` → probability, tree interval, threshold, category, evidence, factors, missing/OOD flags, priority + competing incidents, retrospective label. `overrides` with `null` simulates missing inputs |
| POST | `/api/simulate` | `{scenario_id, response_delay, steps, seed, n_seeds, per_incident{…}, coordinator_assignment?}` → plots, per-policy frames/events/metrics, comparison, assumptions. When the crew is assigned (or `coordinator_assignment` is given), a `coordinator` policy ("Your assignment") runs under the same random draws |
| POST | `/api/incidents/{id}/action` | `{action: ASSIGN_INSPECTION \| REQUEST_RECHECK \| DISMISS, reason}`. The reason is required. `ASSIGN_INSPECTION` sends the only crew. The server snapshots the recommendation, rank, score, probability, `left_waiting` and `reassigned_from`, then writes `actions` + `team_assignments` + `incident_status`. Returns the action, crew state, per-incident attendance and `record_backend` |
| GET | `/api/actions?scenario=&include_archived=` | Decision record with full snapshots, `stored_in` (`supabase \| sqlite \| local_fallback`) and the historical outcome per incident (replay only) |
| GET | `/api/evaluation` | Provenance, audit, baseline vs RF (val/test, PR curve, reliability), policy backtest |
| GET | `/api/geospatial/{id}` | Earth Engine context (or `available:false` with a reason) + protected-area GeoJSON with boundary status |
| POST | `/api/ai/explain` | OpenAI incident briefing (validated, cached by evidence hash; deterministic fallback) |
| POST | `/api/ai/field-brief` | Grafilab English field brief (validated; deterministic fallback) |

Frames are encoded as one digit string per plot per step (400 chars, row-major). Cell states: 0 empty · 1 healthy · 2 burning · 3 burned · 4 intervention-affected.

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
