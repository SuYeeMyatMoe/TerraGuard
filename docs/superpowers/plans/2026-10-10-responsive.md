# Responsive TerraGuard Implementation Plan

**Goal:** Make the existing landing and command center usable on phones, tablets and desktop.

**Architecture:** Responsive component layouts and scoped styles; a pure map-padding helper adapts camera framing to the container. Keep map renderers and backend contracts intact.

**Tech stack:** Next.js, React, Tailwind, CSS Modules, MapLibre, React Three Fiber; inline execution without subagents as requested.

- [x] Record baseline browser geometry and screenshots; run `npm test` (42 passing baseline).
- [x] Add camera regression tests in `frontend/tests/responsive-map.test.cjs`: finite padding at 320 × 320, useful visible area in phone/tablet/desktop and short landscape, desktop reserved sidebars, mobile centered view. Observe missing helper failure, then implement `frontend/src/lib/map-layout.ts` and use it in `EarthMap.tsx` for selection, location and resize. Run the focused tests.
- [x] Change `CommandCenter.tsx` to a compact vertical flow with a map viewport, playback/conditions and information/decisions. Keep desktop overlay classes at `lg`; adjust `TopBar.tsx` to wrap controls, constrain replay dropdown and expose accessible icon names.
- [x] Add a touch-friendly collapse control in `EarthEnginePanel.tsx`; preserve mounted inputs/state. Constrain comparison and legend in `EarthView.tsx`. Bound drawers/modal/toasts and wrap timeline/segmented controls. Adapt 3D camera zoom to canvas width.
- [x] Tune landing CSS for small and short screens without changing the story. Add safe-area spacing and mobile touch sizing.
- [x] Browser-check all viewport sizes for clipping and overlap, camera/imagery control stability, drawers and decision/playback actions. Run `npm test`, `npm run lint`, `npm run build`; inspect production build in the browser. Save screenshots and results outside source.
- [x] Review diff and preserve existing untracked files; deliver changes on `codex/mobile-responsive` without unsolicited publication/merge.


## Verification results

- `npm test`: 45 passing, 0 failures (42 baseline + 2 camera-layout cases + a zero-height canvas lifecycle regression).
- `npm run lint` and `npm run build`: exit 0, including TypeScript compilation.
- Production browser checks at actual CSS viewports 320 × 568, 390 × 844, 768 × 1024, 1024 × 768, 1440 × 900 and 844 × 390: landing, Earth View and 3D have no settled horizontal overflow. Earth View incident markers are framed inside the viewport on initial load, including cached map styles.
- Browser interaction checks: NDVI/comparison selections survive collapsing the imagery panel; zoom remains available; incident selection, crew assignment, reason entry, confirmation and persisted decision record work against the isolated local SQLite database. All four methodology tabs fit the compact drawer. Playback, policy selection and condition changes remain usable.
- Reduced-motion preference toggling and portrait/landscape resizing reproduced a zero-height source-canvas exception. The regression first failed, then passed with empty-canvas guards; the production browser subsequently reported zero runtime exceptions for the same sequence.
- First camera framing is immediate so the initial ResizeObserver callback cannot cancel it; subsequent selection changes retain animated framing. Overview fit uses absolute padding to avoid counting the resize padding twice.
- Browser captures live outside source under the task's `responsive/` artifact directory. Test configuration deliberately used no copied credentials: live Earth Engine tile availability was not revalidated, while imagery state and existing raster tests passed.
- Reviewed the diff locally without subagents. Existing `.serena/`, `docs/PROJECT_ANALYSIS_AR.md` and `frontend/AGENTS.md` in the original checkout are preserved.
