# Global magnetic cursor

The app root mounts one `GlobalMagneticCursor`. The cursor is an imperative, pointer-transparent overlay with requestAnimationFrame interpolation; it does not update React state per frame or move buttons. Homepage design, scenes, copy, navigation, and forest effects are unchanged by this enhancement. No dependencies were added.

## Files

- `frontend/src/app/layout.tsx`: mounts the component once across routes.
- `frontend/src/components/cursor/GlobalMagneticCursor.tsx`: semantic detection, geometry tracking, morphing, click feedback, modal placement, native fallbacks, and cleanup.
- `frontend/src/components/cursor/magnetic-cursor.css`: orange dot, thin outline, glow, and conditional native-cursor hiding.

## Tuning

Edit `CURSOR_CONFIG` in the component:

| Control | Value |
| --- | --- |
| Default diameter | 14px |
| Outline padding around target | 3px |
| Attraction distance | 8px; cursor attraction only |
| Position interpolation time constant | 28ms |
| Hover position / shape time constant | 85ms; approximately 255ms to settle 95% |
| Click pulse duration | 220ms; exponential decay |

CSS uses `#E88A2A` (RGB 232,138,42), a 1.5px outline, and a 15px blur with 2px spread. Glow alpha is 0.12 normally, 0.22 on hover, and receives up to 0.14 extra on click. The inner highlight is `#F4A340` at 0.08 alpha.

Buttons, links, role buttons/links, and summary controls are detected automatically. Nested icons and spans resolve to their interactive parent. Use `data-cursor="interactive"` on custom clickable elements; `data-cursor="default"` forces the small cursor; `data-cursor="none"` restores native behavior for that subtree. Disabled and inert elements are excluded.

The custom cursor is enabled only for a fine pointer with hover and no reduced-motion preference. Inputs, textareas, selects, editable fields, selectable text, touch input, and Tab navigation retain native behavior. Native cursor hiding is activated only after the custom overlay renders successfully. Resize, scrolling, target/ancestor mutations, active CSS animations, and route changes refresh geometry. Native modal dialogs receive the same overlay in their top layer rather than creating a duplicate.

## Verification

- TypeScript (`npx.cmd tsc --noEmit`) and targeted ESLint passed.
- Browser checks confirmed one global overlay, rounded CTA alignment with approximately 3px padding, native dialog layering, keyboard fallback, and cursor operation on the simulation route.
- Production build was attempted but blocked before app compilation by Windows SWC access denial while loading `next.config.ts`. Production build success is not confirmed.
- The brief supplied no accessible reference video; timing follows its specified ranges.
