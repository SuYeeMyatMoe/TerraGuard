# TerraGuard dust cursor

TerraDustCursor is an original local Canvas 2D implementation inspired by the supplied video, not the licensed React Bits Pro component. No license key or new frontend dependencies are needed. Unused React Bits registry configuration and the license variable were removed.

The homepage keeps its three scenes, background dots, copy and controls. A single transparent canvas follows the pointer across all scenes. Olive and golden grains drift behind the pointer through local curling wakes. A left click emits an expanding mushroom-shaped puff. The canvas never intercepts clicks or hides the native cursor. Interactive elements still scale to 1.06 on hover.

Palette: #925E06, #8DA432, #B18A42, #365004, #C5B66F.
Tuning: maximum 3,200 particles; grain radius 0.45–1.2px; opacity 0.25–0.55; lifespan 1.4–2.2s; 36px fresh trail width; up to eight short-lived wake vortices; 600 particles per click puff. Device pixel ratio is capped at 1.5. Animation stops when the dust dissolves. React does not rerender per frame.

Disabled on touch/coarse pointers and reduced motion. Tab, window blur and document hiding clear particles. Inputs, editable content and data-cursor=none regions do not emit dust. Native dialogs remain above the canvas and suspend emission. The simulation route does not mount the canvas.

Files: frontend/src/components/cursor/TerraDustCursor.tsx, pointer-effects.css, app/layout.tsx, and the homepage scene/CSS cleanup. The former BackgroundPointerEffect and lens styling were removed.

Checks: TypeScript and targeted ESLint pass. Browser review confirmed the trail and click puff, one pointer-transparent canvas, native pointer visibility, working dialog opening/closing and keyboard focus. Production build remains unverified after the earlier Windows SWC permission failure.
