# Automatic Earth View analysis

User approved starting historical analysis when NDVI or before/after is selected, while keeping ordinary panning free of Earth Engine requests. Work stays on `codex/automatic-earth-analysis`, without subagents or visual tests.

Capture a viewport in an analysis request when a control is used. An effect runs the controller using that captured request and the current incident/window/mode. Live viewport state does not drive requests. If a control is used before the first viewport arrives, capture that first viewport once. Keep the existing zoom guard, cache, cancellation and stale-response protection. Remove the prominent Analyze button in this automatic mode; keep optional retry/update actions for failed or moved-away imagery.

- [x] Add component callback/effect regressions for initial browsing, NDVI selection, mode/window changes, camera movement, early selection and world-scale guards. Add a panel rendering check for removal of the extra step; run them red.
- [x] Update `EarthView.tsx` to store captured analysis intent and use control handlers; execute requests only from its effect, avoiding the old settings-reset/request race. Update `EarthEnginePanel.tsx` automatic-mode text and button visibility.
- [x] Run focused frontend checks, lint changed components, build once, update operational documentation, start the local build and commit. Leave backend, 3D and operational storage unchanged.
