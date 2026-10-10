# TerraGuard dust cursor

TerraDustCursor is an original local Canvas 2D implementation inspired by the supplied video, not the licensed React Bits Pro component. No license key or new frontend dependencies are needed. Unused React Bits registry configuration and the license variable were removed.

The homepage keeps its three scenes, background dots, copy and controls. A single transparent canvas follows the pointer across all scenes. Olive and golden grains drift behind the pointer through local curling wakes. A left click emits an expanding mushroom-shaped puff. The canvas never intercepts clicks or hides the native cursor. Interactive elements still scale to 1.06 on hover.

Palette: #925E06, #8DA432, #B18A42, #365004, #C5B66F.
Tuning: maximum 3,200 particles; grain radius 0.45–1.2px; opacity 0.25–0.55; lifespan 1.4–2.2s; 36px fresh trail width; up to eight short-lived wake vortices; 600 particles per click puff. Device pixel ratio is capped at 1.5. Animation stops when the dust dissolves. React does not rerender per frame.

Disabled on touch/coarse pointers and reduced motion. Tab, window blur and document hiding clear particles. Inputs, editable content and data-cursor=none regions do not emit dust. Native dialogs remain above the canvas and suspend emission. The simulation route does not mount the canvas.

Files: frontend/src/components/cursor/TerraDustCursor.tsx, pointer-effects.css, app/layout.tsx, and the homepage scene/CSS cleanup. The former BackgroundPointerEffect and lens styling were removed.

Checks: TypeScript and targeted ESLint pass. Browser review confirmed the trail and click puff, one pointer-transparent canvas, native pointer visibility, working dialog opening/closing and keyboard focus. Production build remains unverified after the earlier Windows SWC permission failure.

## Scene palettes and interactive sphere

Dust now blends continuously with the homepage crossfade progress. Life keeps the original olive/gold palette; Fire uses muted reds (#A93424, #C74B31, #92502B, #80281E, #DB7650); Ash uses grays (#686B69, #90928D, #777B76, #4F5452, #AAA99F). Existing particles adopt the new palette too, and scrolling upward reverses the blend.

The first scene contains an interactive shaded sphere around its unchanged heading, description and buttons. frontend/src/components/ui/waves-shader.tsx integrates the user-supplied Waves component, projects the field onto a sphere, applies TerraGuard amber/gold colors and directional lighting, and enables pointer distortion. CSS adds a central contrast layer and responsive circular layout. No dependencies or external assets were needed. The shader renders at roughly 30fps, caps resolution at 450,000 pixels, pauses while its scene is inactive, and draws a static image under reduced motion. CSS provides a fallback sphere when WebGL is unavailable.

Verification: Desktop and 390x844 responsive previews keep the text and CTA inside the sphere. Browser palette checks confirm fire and ash states. TypeScript and targeted ESLint pass.
