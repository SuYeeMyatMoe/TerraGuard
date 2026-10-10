# Background pointer interaction

The orange custom cursor has been removed. Native browser cursors remain visible everywhere.

- frontend/src/app/layout.tsx mounts BackgroundPointerEffect once.
- frontend/src/components/cursor/BackgroundPointerEffect.tsx tracks the pointer with requestAnimationFrame and a 30ms interpolation constant, without per-frame React rendering.
- frontend/src/components/cursor/pointer-effects.css enlarges enabled buttons and links to 1.06 on hover over 220ms. Individual CSS scale preserves existing placement transforms.
- frontend/src/components/landing/CinematicStory.tsx adds a decorative lens to each of the three scenes.
- frontend/src/components/landing/cinematic.module.css magnifies the dotted background 1.7 times inside a 230px soft circular mask, anchored to the pointer. Text and forest illustrations remain unchanged.

Touch devices and reduced-motion preferences disable the effects. Mouse leave, Tab navigation, window blur and document hiding dismiss the lens. Scroll and resize refresh coordinates. All decorative layers ignore clicks. No dependencies were added.

The old GlobalMagneticCursor component and magnetic-cursor.css were deleted. Work remains on homepage-ui; main is unchanged.

Verification: TypeScript and targeted ESLint pass. Browser checks confirm zero old cursor overlays, three decorative lenses, native cursor visibility, and pointer coordinates updating the magnified background. A production build remains unverified due the previously observed Windows SWC access denial.
