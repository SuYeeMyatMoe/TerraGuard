# TerraGuard AI

**Predict the threat. Test the response. Protect the forest.**
Track 1 (Predictive Model). Three forest incidents, one available team: which one deserves attention first?

TerraGuard is a two-page MVP:

- `/`: landing page.
- `/simulation`: Forest Command Center with two modes:
  - **Earth View**: real coordinates, protected areas and past-24 h detections, with a worldwide satellite basemap and Sentinel-2 RGB/NDVI triggered by analysis controls, roads/place labels, retrospective before/after comparison, independent layer controls and distance/area measurement from Earth Engine when configured.
  - **3D Simulation**: React Three Fiber forest, driven by a Python cellular automaton.

The flow is: select incident → 48 h prediction → AI briefing → simulate → compare First-alert vs AI-priority → approve action → field brief → notification.

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
cp .env.example .env        # required: SUPABASE_URL / SUPABASE_SECRET_KEY; optional: AI and data keys
.venv/Scripts/python -m uvicorn app.main:app --port 8010

# frontend (Node 22)
cd frontend
npm install
cp .env.local.example .env.local   # Earth Engine credentials belong in backend/.env
npm run dev                        # http://localhost:3000  (proxies /api → :8010)
```

The committed data snapshot (`backend/data`) supplies detections, model artifacts, and simulation inputs locally. Operational statuses and audit history require Supabase. Basemap tiles and LLM calls use the internet and degrade gracefully; database failures return 503 and are never silently saved to SQLite.

Apply the migration in `supabase/migrations` before starting the backend, then configure a backend-only secret key. See [docs/SUPABASE.md](docs/SUPABASE.md) for setup and verification. The old `python -m app.db --reset` command refuses cloud deletion; use a separate project for disposable demos.

Earth View uses MapLibre with Esri World Imagery for stable worldwide navigation, then loads Earth Engine raster analysis automatically when NDVI is selected or the historical period/view is changed. Panning does not trigger analysis; an optional Update imagery action captures a new viewport. No Google Maps browser API key is required. Register a Google Cloud project for Earth Engine, configure `GEE_PROJECT` in `backend/.env`, and authenticate locally or use a backend service account. See [docs/EARTH_ENGINE.md](docs/EARTH_ENGINE.md). Missing credentials retain worldwide browsing and report the missing Earth Engine configuration when analysis is requested; images/statistics are never fabricated.

## Rebuild the data and model

```bash
cd backend
.venv/Scripts/python -m ml.fetch_firms       # FIRMS API (MAP_KEY) | manual CSV | labelled synthetic fallback
.venv/Scripts/python -m ml.features          # incidents, labels, features, splits, audit.json
.venv/Scripts/python -m ml.train             # baseline vs RF → model.joblib, evaluation.json
.venv/Scripts/python -m ml.build_scenarios   # replay days (outcome-blind rule)
.venv/Scripts/python -m ml.policy_backtest   # 357-day policy backtest
.venv/Scripts/python -m ml.fetch_gee         # optional, needs Earth Engine credentials
.venv/Scripts/python -m pytest tests         # isolated tests: persistence, sim fairness, leakage, AI validator, API
```

> **Data status:** no FIRMS MAP_KEY was configured, so the current snapshot is **synthetic** data in the FIRMS VIIRS schema, conditioned on real Open-Meteo weather. It is labelled as synthetic everywhere in the UI. Add a free key from https://firms.modaps.eosdis.nasa.gov/api/map_key/ and rerun the pipeline to get real evidence.

## Docs
- [docs/DATA.md](docs/DATA.md): provenance, incident construction, labels, leakage controls, results
- [docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md): prioritisation weights and simulation assumptions
- [docs/API.md](docs/API.md): endpoints and contracts
- [docs/AI_SAFETY.md](docs/AI_SAFETY.md): LLM grounding, validation and fallback rules
- [docs/SUPABASE.md](docs/SUPABASE.md): operational persistence, server-only credentials, migration and verification
- [docs/EARTH_ENGINE.md](docs/EARTH_ENGINE.md): Earth View imagery, cloud masking, account setup and verification
