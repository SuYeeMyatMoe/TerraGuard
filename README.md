# TerraGuard AI

**Three fires. One team.**

TerraGuard (Track 1: Predictive Model) shows which wildfire incident should get the only field crew, who is left waiting, and keeps a decision record you can defend.

> Detections are not confirmed fires. LLMs only explain verified outputs. They never produce probabilities, rankings or simulation results.

## Contents

- [What it does](#what-it-does)
- [How it works](#how-it-works)
- [Results](#results)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Project structure](#project-structure)
- [Decision records](#decision-records-sqlite-or-supabase)
- [Earth View and Earth Engine](#earth-view-and-earth-engine)
- [Rebuild data and model](#rebuild-data-and-model)
- [Testing](#testing)

## What it does

TerraGuard is a two-page MVP:

| Route | Purpose |
| --- | --- |
| `/` | Landing page with a scroll-driven story. |
| `/simulation` | Forest Command Center. |

The Command Center has two modes:

- **Earth View** (primary): real coordinates, protected areas and past-24 h detections on a worldwide satellite basemap.
  - Sentinel-2 RGB/NDVI imagery is prepared automatically through Google Earth Engine when configured.
  - Roads and place labels, retrospective before/after comparison, independent layer controls, and distance/area measurement.
- **Test the response (3D)** (secondary): a React Three Fiber forest driven by a Python cellular automaton. It compares your assignment against *first-alert* and *AI-priority* under identical conditions.

### The default flow

1. Open Earth View: real coordinates, the past 24 h, and three competing incidents.
2. Pick the incident.
3. Send the only crew (the hypothetical *Borneo Field Verification Crew*) with a reason.
4. The other incidents are shown as unattended, with their 48 h risk.
5. The decision is recorded: incident, the recommendation at that moment, reason, crew, time, and who was left waiting.

## How it works

```text
NASA FIRMS VIIRS + Open-Meteo ──► incidents, labels, past-only features ──► Random Forest (vs baseline)
                                                                                    │
                            deterministic prioritiser (fixed weights) ◄─────────────┘
                                            │
        NumPy cellular automaton (common random numbers, 30 seeds) ──► R3F 3D forest
                                            │
   evidence package ──► OpenAI briefing / Grafilab field brief ──► validator ──► UI
                                            │
                  human decision ──► Supabase audit log + status ──► notification
```

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 16, React 19, MapLibre GL, React Three Fiber |
| Backend | FastAPI (Python) |
| ML / simulation | scikit-learn Random Forest, NumPy cellular automaton |
| Data | NASA FIRMS VIIRS, Open-Meteo, Sentinel-2 via Google Earth Engine |
| Records | SQLite locally, Supabase in production |
| AI briefings | OpenAI, Grafilab (validated, grounded in the evidence package) |
| Hosting | Vercel Services (Beta) |

## Results

The committed snapshot uses **real** NASA FIRMS VIIRS data (S-NPP + NOAA-20, 570,840 detections, 2023-2025) with Open-Meteo weather.

| Metric | Value |
| --- | --- |
| Held-out 2025 PR-AUC, Random Forest | **0.623** |
| Held-out 2025 PR-AUC, baseline | 0.535 |
| One-team backtest (361 days): another detection within 48 h after the **AI-priority** choice | **32.8%** |
| Same backtest, **first-alert** choice | 16.4% |

The model gain is modest. Without a FIRMS key the pipeline falls back to a clearly labelled synthetic dataset. Details are in [docs/DATA.md](docs/DATA.md).

## Quick start

**Prerequisites:** Python 3.11 locally (Vercel uses 3.12) and Node 22.

### 1. Backend

```bash
cd backend
py -3.11 -m venv .venv
.venv/Scripts/pip install -r requirements-dev.txt
cp .env.example .env     # optional locally: Supabase, AI and Earth Engine keys
.venv/Scripts/python -m uvicorn app.main:app --port 8010
```

On macOS/Linux, use `python3.11` and `.venv/bin/...` instead of `py -3.11` and `.venv/Scripts/...`.

### 2. Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local   # Earth Engine credentials belong in backend/.env
npm run dev                        # http://127.0.0.1:3000 (proxies /api → :8010)
```

### What works offline

The committed data snapshot in `backend/data` supplies detections, model artifacts and simulation inputs locally. Basemap tiles and LLM calls need the internet and degrade gracefully when unavailable.

## Configuration

All keys live in `backend/.env` (copy from `backend/.env.example`). Never commit it, and never put keys in the Next.js app. Every variable is optional for local development.

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | Operational records in Supabase (service-role / `sb_secret_` key only). Without them, SQLite is used. |
| `FIRMS_MAP_KEY` | NASA FIRMS API key for rebuilding data ([get one free](https://firms.modaps.eosdis.nasa.gov/api/map_key/)). |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | Incident briefings (default model `gpt-4.1-mini`). |
| `GRAFILAB_API_KEY`, `GRAFILAB_MODEL` | Field briefs. Leave the model blank to auto-pick. |
| `GEE_PROJECT` | Google Cloud project registered for Earth Engine. |
| `GEE_SERVICE_ACCOUNT_JSON` / `GEE_SERVICE_ACCOUNT_JSON_B64` | Earth Engine service account (file path locally, base64 or raw JSON on Vercel). |
| `GEE_TILE_SIGNING_SECRET` | HMAC secret for tile handles. Required in production. |

## Project structure

```text
TerraGuard/
├── backend/
│   ├── app/          FastAPI app: API, priority, evidence, AI, records, Earth Engine
│   ├── ml/           Data fetching, features, training, scenarios, backtests
│   ├── sim/          Cellular-automaton fire simulation
│   ├── supabase/     schema.sql for operational records
│   ├── data/         Committed data snapshot, model artifacts, local SQLite DB
│   └── tests/        Backend tests
├── frontend/
│   ├── src/app/          Next.js routes (landing, /simulation)
│   ├── src/components/   command, landing, scene, ui
│   ├── public/           Static assets (WebP textures)
│   └── tests/            Frontend tests
├── docs/             Design, API, data, deployment and safety docs
└── vercel.json       Vercel Services config (frontend + backend)
```

## Decision records: SQLite or Supabase

Operational records are coordinator actions (the audit), incident status and crew assignments. They are stored in `backend/data/terraguard.db` by default. Detections, the model and simulation results always stay in the files the backend loads.

### Use Supabase

1. Run [`backend/supabase/schema.sql`](backend/supabase/schema.sql) once in the Supabase SQL editor:
   - Part 1: creates the `actions`, `incident_status` and `team_assignments` tables.
   - Part 2: adds the decision-snapshot columns.
   - Part 3: enables RLS with no browser policies.
   - Part 4: makes `actions` append-only.
   - Part 5: enables `CONTINUE_MONITORING` and `ESCALATE_COORDINATION` decisions.
2. Put `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (the service-role key) in `backend/.env`. Never put the key in the Next.js app.
3. Restart the backend. `/api/health` reports `record_backend: "supabase"`.

If Supabase becomes unreachable, decisions are saved to SQLite and marked **"Saved locally: Supabase unreachable"** in the UI.

### Maintenance commands

```bash
cd backend
.venv/Scripts/python -m app.records --sync                  # push locally saved fallback decisions to Supabase
.venv/Scripts/python -m app.records --archive SCN-20250729  # clean demo state; archives, never deletes
.venv/Scripts/python -m app.records --reset-local           # wipe local SQLite records (development only)
```

More in [docs/SUPABASE.md](docs/SUPABASE.md).

## Earth View and Earth Engine

Earth View uses MapLibre with Esri World Imagery for stable worldwide navigation, then prepares reusable Earth Engine imagery for the selected replay period.

- Panning, layer switches and comparison reuse the same tile resources. **Retry imagery** recreates them only on request.
- No Google Maps browser API key is required.
- To enable Sentinel-2 RGB/NDVI: register a Google Cloud project for Earth Engine, set `GEE_PROJECT` in `backend/.env`, then authenticate locally or use a backend service account.
- Without credentials, worldwide browsing still works and the UI reports the missing Earth Engine configuration when analysis is requested. Images and statistics are never fabricated.

See [docs/EARTH_ENGINE.md](docs/EARTH_ENGINE.md).

## Rebuild data and model

Run from `backend/`:

```bash
.venv/Scripts/python -m ml.fetch_firms       # FIRMS API (MAP_KEY) | manual CSV | labelled synthetic fallback
.venv/Scripts/python -m ml.features          # incidents, labels, features, splits, audit.json
.venv/Scripts/python -m ml.train             # baseline vs RF → model.joblib, evaluation.json
.venv/Scripts/python -m ml.build_scenarios   # replay days (outcome-blind rule)
.venv/Scripts/python -m ml.policy_backtest   # 361-day policy backtest
.venv/Scripts/python -m ml.fetch_gee         # optional, needs Earth Engine credentials
```

## Testing

```bash
# backend: persistence, simulation fairness, leakage, AI validator, API
cd backend
.venv/Scripts/python -m pytest tests

# frontend
cd frontend
npm test
npm run lint
```

