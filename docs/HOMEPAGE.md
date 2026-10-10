# TerraGuard homepage — restored smooth fades

This revision changes transitions only. Existing chapter text, order, branding, typography, palette, subtle dotted background, forest visuals, buttons and supporting-content dialog remain intact.

## Changes
- `CinematicStory.tsx`: removes burn SVGs and mask updates; restores reversible scroll-linked opacity blending and subtle vertical motion.
- `story.ts`: replaces burn-window settings with `firstFade` and `secondFade`; removes burn-edge roughness. Scene content is unchanged.
- `cinematic.module.css`: removes burn-edge/smoke styles and clip-path animation; uses opacity and transform.
- `BurnRevealTransition.tsx`: deleted, along with the temporary burn geometry check script.

No dependency was introduced for the burn transition, so no dependency removal is needed. Environmental flames, smoke, light and embers in the Fire forest remain.

## Transition behavior
Exactly three scenes remain in the existing sticky storytelling container. A single passive scroll listener schedules animation-frame updates. Each outgoing scene fades over the configured window to reveal the next opaque scene underneath, producing a true composited crossfade without blank frames. Copy gently exits during the first half and enters during the second half, avoiding overlapping large headlines. Movement is limited to the copy and a small forest parallax; shared navigation stays steady. The state is determined by current scroll progress, so upward scrolling fully reverses it.

`STORY_TIMING` in `story.ts` controls total scroll distance (`scrollScreens`), fade windows (`firstFade`, `secondFade`), movement (`incomingOffset`) and chapter navigation destinations (`chapterStops`). Reduced-motion users retain ordinary full-height sections with no pinning or animated fades; ambient environmental motion is disabled.

## Verification
TypeScript and targeted ESLint pass. Browser inspection confirms exactly three scenes, no burn SVG overlays or clip paths, intermediate opacity values during scrolling, retained Fire visuals, and responsive chapter navigation. The production build was attempted again but Next.js SWC hits the existing Windows sandbox path-resolution `Access is denied` error before compiling the app. Complete production build verification outside the sandbox with `npm.cmd run build`.
