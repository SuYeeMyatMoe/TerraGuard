# Forest Performance Implementation Plan

> **Execution:** Implement inline in the current session. The user explicitly prohibited subagents; the previously started agent was interrupted before making changes. Review the spec and code directly. Steps use checkbox syntax for tracking.

**Goal:** Make the existing A/B/C scene lighter while preserving readable fire, trees and crews and every backend cell/event.

**Architecture:** A shared quality controller drives DPR, shadows and particle budgets for overview and detail. Static resources/routes are reused; habitat overlays and fire glow are batched. Simulation results, crew arrival, water eligibility and grid dimensions remain authoritative and unchanged.

**Tech Stack:** React 19, Next.js 15.5.27, Three.js 0.180, R3F 9, Drei 10, existing Node test runner with TypeScript transpilation.

User approved proceeding after the Arabic proposal and its performance update. Work in the explicitly requested `codex/frontend-studio` checkout; preserve pre-existing files. This plan is the first working performance increment. Wider map, road station, new assets, tree wind, a unified Canvas and continuous spatial tree LOD are subsequent increments, not claims of this delivery. Initial measurement after the first optimizations still showed heavy rendering, so this increment also introduces simplified background trees and batches the existing truck body and wheel parts by material while preserving animation.

## Task 1: Establish repeatable validation

- [x] Run `cd frontend && node --test tests/*.test.mjs`: 13 existing tests pass.
- [x] Run production build to expose baseline blockers. Fix only the two incompatible Recharts tooltip parameter annotations in `MethodologyDrawer.tsx`: `formatter={(v) => pct(typeof v === "number" ? v : undefined)}`. Type check is the regression check for this compatibility change.
- [x] Build before scene changes and capture production playback timing using browser tracing, with identical tab viewport, scenario, policy and playback slice before/after. Record limitations if browser tracing is unavailable; do not invent a speedup.

## Task 2: Implement the performance increment

**Files:** create `frontend/src/lib/sceneQuality.ts`, `frontend/src/components/scene/SceneQuality.tsx` and meaningful tests in `frontend/tests/sceneQuality.test.mjs`; modify active `ForestStudio.tsx`, `ForestOverview.tsx`, `ForestScene.tsx`, `SharedLandscape.tsx`, `NaturalTrees.tsx`, `WaterEffects.tsx`; route cache in `crewMotion.ts` with tests. Shared ownership is implemented in `sceneResources.ts` with lifecycle tests. Truck batching lives in `staticMeshBatch.ts`, with local-transform and animation tests, and integrates in `FireTruckModel.tsx`.

- [x] Write failing quality tests with the existing transpile harness. Cover DPR clamping to device ratio and quality bounds, invalid/slow FPS not raising quality, hysteresis, and budgets preserving at least one visible flame for every burning cell. Example contract: `assert.ok(getSceneQuality('balanced', 1).dpr <= 1)`; `assert.ok(getSceneQuality('economy', 2).flamesPerCell >= 1)`.
- [x] Implement `QualityMode = 'auto' | 'economy' | 'balanced' | 'high'` and pure quality settings. Automatic starts balanced; economy DPR cap 1, balanced 1.5, high 1.75. Default shadows 1024, high 2048; background trees cast no shadow. Adapt after sustained slow frames with separate recovery threshold/time; never sample demand-mode idle intervals or hidden-tab intervals. Pure transition tests must exercise prolonged slow/recovery windows and ensure bounds.
- [x] Add a shared context/controller used by both Canvas roots. Respect document visibility and active/playing; animation must remain correct on resume. A small accessible quality select belongs in the existing forest controls, with preference shared across overview/detail. HTML labels remain independent of canvas resolution.
- [x] Share immutable tree geometries/materials across simultaneously mounted plots. Reuse safely across StrictMode effect replay; one plot unmount must not dispose another's resources. Ensure eventual disposal when unused and reuse owned textures safely. Keep tree appearance and instance transforms intact. Add a lifecycle test for shared ownership/disposal if using a cache.
- [x] Use textured two-level trees with fewer fine branches for the background and economy mode. Full incident trees remain available in balanced/high. Cache by species/detail; borrowed ez-tree module textures remain library-owned. Continuous distance LOD and crossfades remain a later increment.
- [x] Merge static truck geometry by matching appearance and shadow flags in model-local space; batch each wheel independently so wheel rotation remains correct. Leave the animated beacon material separate. Test world-to-local transforms, appearance grouping and beacon exclusion before integration. Dispose merged geometry/materials and restore source visibility on effect cleanup.
- [x] Reduce shared terrain segments from `230×165` to `115×83`, preserving footprint and plot alignment (19,090 triangles instead of 75,900). Keep local terrain grid 100×100 in this increment to preserve cell color boundaries; do not remove backend cells.
- [x] Batch protected-cell planes in one instanced mesh per plot and boundaries/grid into merged Line segments with matching style. Batch per-cell fire glows into one instanced mesh. Preserve cell and habitat positions and ignition picking.
- [x] Pool particle Object3D/Vector3 instances and precompute terrain origins once per active-cell change. Set conservative local bounding spheres that include every flame/smoke/water position; remove per-frame `computeBoundingSphere()` without losing frustum correctness. Apply quality budgets to smoke and water while keeping every burning cell visible. Use low-cost unlit smoke material where appearance remains comparable.
- [x] Cache `getCrewPlan` by PlotInfo and PolicyResult identity, using WeakMaps so discarded scenarios can be reclaimed. Test same inputs reuse the plan, new result changes assignment/arrival, and new plot recomputes the lane. Returned plan is immutable by convention; no render code mutates it.
- [x] Run `node --test tests/*.test.mjs`, `npx tsc --noEmit --incremental false`, and ESLint on changed files. All simulation contract tests must stay green. Do not change backend, store simulation settings, manifests or lockfile.

## Task 3: Review and verify in the browser

- [x] Review spec compliance, then code quality and lifecycle behavior directly, without subagents. Resolve findings before final validation.
- [x] Build production and replay the same baseline slice. Record before/after evidence with viewport and limitations. Test all quality modes, paused camera interaction, selected incident, policy change, grid/habitat toggles, replay and delayed suppression. No Send crew or saved decision actions.
- [x] Save a screenshot of the actual changed scene and include it in the user-facing result. Update the Arabic proposal with delivery status, validation and remaining increments.
- [x] Keep changes reviewable on `codex/frontend-studio`; do not merge or push as part of this increment.

## Verification record

Completed inline without subagents. Production trace: 6.9 to 38.5 DrawFrame/s in the same eight-second local scenario window. 21 tests, type check, changed-file ESLint and production build pass. Browser quality/view/grid/habitat/camera/replay/policy checks pass; delayed arrival at step 4 starts water at 4, not 3. Evidence and limits: docs/FOREST_PERFORMANCE_RESULTS_AR.md. Screenshot: docs/verification/forest-performance-water.jpg. New map design remains a subsequent increment.
