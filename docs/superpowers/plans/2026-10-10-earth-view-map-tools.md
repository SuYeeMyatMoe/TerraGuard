# Earth View Map Tools Implementation Plan

> Backend implementation and spec review initially used subagents. The user subsequently requested no further subagents; root completes all remaining implementation and review directly. User authorized the complete design; no repeated approval gates are needed.

**Goal:** Deliver the six accepted Earth View improvements and document useful additional layers.

**Architecture:** The backend exposes rectangular Earth Engine display extents and separately computed incident statistics, plus an optional retrospective post window. The frontend controls viewport requests, synchronized before/after rendering, overlay visibility and local geographic measurements.

**Tech Stack:** FastAPI, Earth Engine Python SDK, MapLibre, React/TypeScript, pytest, Node tests.

## Tasks

- [x] Backend: extend backend/app/earth_engine.py and backend/app/main.py. Add tests in backend/tests/test_earth_engine.py before implementation: bbox finite/order/study intersection, cache separation for extent/mode, retrospective cutoff, independent before/after failures and real graph separation. Keep existing calls working. Run `.venv/bin/python -m pytest tests/test_earth_engine.py -q` in backend; expected all pass. Review compliance then code quality.
- [x] Frontend pure helpers: create frontend/src/lib/map-geometry.ts for quantized study-clipped viewport and spherical distance/area/simple-polygon validation. Extend controller/API/types for bbox/mode and stale request identity. Add numerical and race tests before implementation, then `npm test` in frontend.
- [x] Renderer: split map responsibilities into frontend/src/components/command/EarthMap.tsx and controls. Insert raster below roads/symbol labels, retain protected/context layers above imagery, add independently toggled analysis and measurement GeoJSON. Use camera-synchronized comparison maps with a common incident-marker overlay; release event handlers/maps on unmount. Debounce viewport updates and avoid a request loop caused by changing source tiles or fitting the same incident.
- [x] Controls: extend EarthEnginePanel and add a focused map tools panel. Provide before/after mode and divider, both window/date provenance, layer toggles, and distance/area finish/undo/clear. Measurement input consumes map clicks only while drawing. No incident statistics appear in unselected overview.
- [x] Verify: backend pytest, frontend npm test/lint/build, live metadata/PNG-JPEG tiles for viewport and compare, browser panning/roads/toggles/measurement/comparison, and 3D switch. Save screenshots. Document verified behavior and future layer sources in docs/EARTH_ENGINE.md and docs/EARTH_VIEW_LAYERS.md; API/README updates as appropriate.
- [x] Commit only feature files on codex/earth-view-map-tools after diff/secret review. Main and pre-existing untracked files remain untouched.
