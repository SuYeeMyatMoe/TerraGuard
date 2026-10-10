# TerraGuard AI

**Three fires. One team.**
Track 1 (Predictive Model). TerraGuard shows which incident should get the only field crew, who is left waiting, and keeps a record you can defend.

TerraGuard is a two-page MVP:

- `/`: landing page.
- `/simulation`: Forest Command Center with two modes:
  - **Earth View**: real coordinates, protected areas and past-24 h detections, with a worldwide satellite basemap and automatically prepared Sentinel-2 RGB/NDVI, roads/place labels, retrospective before/after comparison, independent layer controls and distance/area measurement from Earth Engine when configured.
  - **Test the response (3D)**: React Three Fiber forest, driven by a Python cellular automaton.

The default path:
1. Open Earth View: real coordinates, the past 24 h, and three competing incidents.
2. Pick the incident.
3. Send the only crew (the hypothetical Borneo Field Verification Crew) with a reason.
4. The other incidents are shown as unattended, with their 48 h risk.
5. The decision is recorded: incident, the recommendation at that moment, reason, crew, time, and who was left waiting.

The 3D forest is a secondary "test the response" tool. It compares your assignment against first-alert and AI-priority under identical conditions.

```
NASA FIRMS VIIRS + Open-Meteo ──► incidents, labels, past-only features ──► Random Forest (vs baseline)
                                                                        │
                       deterministic prioritiser (fixed weights) ◄──────┘
                                   │
     NumPy cellular automaton (common random numbers, 30 seeds) ──► R3F 3D forest
                                   │
      evidence package ──► OpenAI briefing / Grafilab field brief ──► validator ──► UI
                                   │
                    human decision ──► Supabase audit log + status ──► notification
```
LLMs explain verified outputs only. They never produce probabilities, rankings or simulation results.

## Run it

```bash
# backend (Python 3.11)
cd backend
py -3.11 -m venv .venv && .venv/Scripts/pip install -r requirements.txt
cp .env.example .env        # optional: Supabase, AI and Earth Engine keys
.venv/Scripts/python -m uvicorn app.main:app --port 8010

# frontend (Node 22)
cd frontend
npm install
cp .env.local.example .env.local   # Earth Engine credentials belong in backend/.env
npm run dev                        # http://localhost:3000  (proxies /api → :8010)
```

The committed data snapshot (`backend/data`) supplies detections, model artifacts, and simulation inputs locally. Operational statuses and audit history use the current decision-record store: SQLite locally, or Supabase when configured, with explicitly labelled local fallback. Basemap tiles and LLM calls use the internet and degrade gracefully.

## Decision record: SQLite locally, Supabase for deployment

Operational records are coordinator actions (the audit), incident status and crew assignments. They are stored in `backend/data/terraguard.db` by default. Detections, the model and simulation results always stay in the files the backend loads.

To use Supabase:
1. Run [`backend/supabase/schema.sql`](backend/supabase/schema.sql) once in the Supabase SQL editor.
   - Part 1 creates the `actions`, `incident_status` and `team_assignments` tables.
   - Part 2 adds the decision-snapshot columns.
   - Part 3 enables RLS with no browser policies.
   - Part 4 makes `actions` append-only.
   - Part 5 enables `CONTINUE_MONITORING` and `ESCALATE_COORDINATION` decisions.
2. Put `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (the service-role key) in `backend/.env`. Never put the key in the Next.js app.
3. Restart the backend. `/api/health` reports `record_backend: "supabase"`.

If Supabase becomes unreachable, decisions are saved to SQLite and marked "Saved locally: Supabase unreachable" in the UI.

```bash
cd backend
.venv/Scripts/python -m app.records --sync                  # push locally saved fallback decisions to Supabase
.venv/Scripts/python -m app.records --archive SCN-20250729  # clean demo state; archives, never deletes
.venv/Scripts/python -m app.records --reset-local           # wipe local SQLite records (development only)
```

Earth View uses MapLibre with Esri World Imagery for stable worldwide navigation, then prepares reusable Earth Engine imagery for the selected replay period. Panning, layer switches and comparison use the same tile resources; Retry imagery recreates them only on request. No Google Maps browser API key is required. Register a Google Cloud project for Earth Engine, configure `GEE_PROJECT` in `backend/.env`, and authenticate locally or use a backend service account. See [docs/EARTH_ENGINE.md](docs/EARTH_ENGINE.md). Missing credentials retain worldwide browsing and report the missing Earth Engine configuration when analysis is requested; images/statistics are never fabricated.

## Rebuild the data and model

```bash
cd backend
.venv/Scripts/python -m ml.fetch_firms       # FIRMS API (MAP_KEY) | manual CSV | labelled synthetic fallback
.venv/Scripts/python -m ml.features          # incidents, labels, features, splits, audit.json
.venv/Scripts/python -m ml.train             # baseline vs RF → model.joblib, evaluation.json
.venv/Scripts/python -m ml.build_scenarios   # replay days (outcome-blind rule)
.venv/Scripts/python -m ml.policy_backtest   # 361-day policy backtest
.venv/Scripts/python -m ml.fetch_gee         # optional, needs Earth Engine credentials
.venv/Scripts/python -m pytest tests         # isolated tests: persistence, sim fairness, leakage, AI validator, API
```

> **Data status:** the current snapshot is **real** NASA FIRMS VIIRS data (S-NPP + NOAA-20, 570,840 detections, 2023-2025) with Open-Meteo weather. On the held-out 2025 test the Random Forest reaches PR-AUC 0.623 against 0.535 for the baseline, a modest gain. In a one-team backtest on 361 days, the AI-priority choice was followed by another detection within 48 h 32.8% of the time, against 16.4% for first-alert. Detections are not confirmed fires. Without a FIRMS key the pipeline falls back to a labelled synthetic dataset; get a free key at https://firms.modaps.eosdis.nasa.gov/api/map_key/.

## Docs
- [docs/DATA.md](docs/DATA.md): provenance, incident construction, labels, leakage controls, results
- [docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md): prioritisation weights and simulation assumptions
- [docs/API.md](docs/API.md): endpoints and contracts
- [docs/AI_SAFETY.md](docs/AI_SAFETY.md): LLM grounding, validation and fallback rules
- [docs/SUPABASE.md](docs/SUPABASE.md): operational persistence, server-only credentials, migration and verification
- [docs/EARTH_ENGINE.md](docs/EARTH_ENGINE.md): Earth View imagery, cloud masking, account setup and verification
