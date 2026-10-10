# TerraGuard AI

**Predict the threat. Test the response. Protect the forest.**
Track 1 (Predictive Model). Three forest incidents, one available team: which one deserves attention first?

TerraGuard is a two-page MVP:

- `/`: landing page.
- `/simulation`: Forest Command Center with two modes:
  - **Earth View**: real coordinates, protected areas and past-24 h detections.
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
                    human decision ──► SQLite audit log ──► notification
```
LLMs explain verified outputs only. They never produce probabilities, rankings or simulation results.

## Run it

```bash
# backend (Python 3.11)
cd backend
py -3.11 -m venv .venv && .venv/Scripts/pip install -r requirements.txt
cp .env.example .env        # add OPENAI_API_KEY / GRAFILAB_API_KEY (optional: FIRMS_MAP_KEY, GEE_*)
.venv/Scripts/python -m uvicorn app.main:app --port 8010

# frontend (Node 22)
cd frontend
npm install
cp .env.local.example .env.local   # optional: NEXT_PUBLIC_GOOGLE_MAPS_KEY for satellite imagery
npm run dev                        # http://localhost:3000  (proxies /api → :8010)
```

The committed data snapshot (`backend/data`) lets the demo run offline. Only the basemap tiles and the LLM calls need the internet, and both degrade gracefully.

Reset decisions before a demo: `backend/.venv/Scripts/python -m app.db --reset` (run from `backend/`).

## Rebuild the data and model

```bash
cd backend
.venv/Scripts/python -m ml.fetch_firms       # FIRMS API (MAP_KEY) | manual CSV | labelled synthetic fallback
.venv/Scripts/python -m ml.features          # incidents, labels, features, splits, audit.json
.venv/Scripts/python -m ml.train             # baseline vs RF → model.joblib, evaluation.json
.venv/Scripts/python -m ml.build_scenarios   # replay days (outcome-blind rule)
.venv/Scripts/python -m ml.policy_backtest   # 357-day policy backtest
.venv/Scripts/python -m ml.fetch_gee         # optional, needs Earth Engine credentials
.venv/Scripts/python -m pytest tests         # 21 tests: sim fairness, leakage, AI validator, API
```

> **Data status:** no FIRMS MAP_KEY was configured, so the current snapshot is **synthetic** data in the FIRMS VIIRS schema, conditioned on real Open-Meteo weather. It is labelled as synthetic everywhere in the UI. Add a free key from https://firms.modaps.eosdis.nasa.gov/api/map_key/ and rerun the pipeline to get real evidence.

## Docs
- [docs/DATA.md](docs/DATA.md): provenance, incident construction, labels, leakage controls, results
- [docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md): prioritisation weights and simulation assumptions
- [docs/API.md](docs/API.md): endpoints and contracts
- [docs/AI_SAFETY.md](docs/AI_SAFETY.md): LLM grounding, validation and fallback rules
