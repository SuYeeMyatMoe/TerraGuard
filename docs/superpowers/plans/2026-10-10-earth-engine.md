# Earth Engine Earth View Implementation Plan

> Execute inline on codex/earth-engine-earth-view. User has authorized implementation; account activation remains external.

**Goal:** Add dated Sentinel-2 RGB and NDVI layers to Earth View.

**Architecture:** Bounded backend Earth Engine provider, metadata cache and opaque same-origin raster handles. MapLibre displays requested layers below incident overlays. A request controller prevents stale responses from displaying the wrong incident.

**Tech Stack:** FastAPI, earthengine-api, httpx, Next.js, MapLibre, pytest and Node tests.

## Steps

- [x] Add failing backend behavioral tests in backend/tests/test_earth_engine.py. Run `backend/.venv/bin/python -m pytest backend/tests/test_earth_engine.py -q`; expect missing service failures.
- [x] Implement backend/app/earth_engine.py with UTC historical windows, lazy authentication, cs_cdf masking, per-scene NDVI, coverage and metadata; cache 64 analyses for 600 seconds and 128 map handles for 1200 seconds. Validate upstream URLs as HTTPS earthengine.googleapis.com and z/x/y within zoom 0–18. Add metadata and tile endpoints to backend/app/main.py, using local incident data without status_map.
- [x] Add earthengine-api to backend/requirements.txt and a connection-check CLI. Document project registration/local authentication, deployment service accounts and image limitations.
- [x] Add failing controller/API tests in frontend/tests/earth-engine.test.cjs; run `npm test` in frontend. Implement request identity, loading/error/reset states in frontend/src/lib/earth-engine.ts and response types/API methods.
- [x] Replace Google Maps provider selection in EarthView with the existing MapLibre renderer plus Earth Engine raster overlays. Add an EarthEnginePanel with satellite/NDVI choice, 14/30/60 day window, opacity, coverage/date metadata, connection-needed/no-data/error/retry states. No source URL or credential appears in the product UI.
- [x] Verify all backend/frontend tests, lint and production build. Restart only TerraGuard servers, inspect Earth View and switching to 3D, and verify configured/unconfigured states without altering production data.
- [x] Review diff for file scope, secret leakage and source attribution. Commit the feature branch and report the remaining live-account activation step accurately.

## Verification result

58 backend and 10 frontend tests passed; frontend lint, TypeScript and production build passed. Browser checks confirmed configuration-needed, incident selection, period/layer controls and switching to the existing 3D view. Real Earth Engine graph construction was verified offline. Live collection/tile retrieval remains pending because the user has no registered Cloud project or credentials. Connection checker correctly exits 2 with a configuration-needed message. No operational rows were written, and the main branch/model/simulation files were not changed by this feature.
