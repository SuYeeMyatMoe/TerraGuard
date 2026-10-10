# Gradual fire suppression and lingering smoke

Implement directly, without subagents, on the current branch. User requested gradual extinguishing and smoke that survives after the flame stops.

Root cause: FireEffects filters only the current burning cells, so a backend transition immediately drops their flame, glow and every airborne puff. Its smoke phase also resets when the active-cell array changes.

Use cached burn intervals from each policy's backend frames. Reconstruct the visual state at a fractional replay tick, preserving backend counts and events. Flames shrink and fade over 2.4 playback seconds after the terminal transition; suppressed cells begin cooling after arrival in their final burning step. Already emitted smoke continues its current lifetime, without wrapping into new emissions after the source stops. Maximum remaining puff lifetime is about 13.3 playback seconds. Speed changes scale animation, pausing freezes it, and scrubbing or switching views reconstructs the same state without previous-scene ghosts.

- [x] Add regression tests for backend suppression/burnout intervals, policy identity, smooth heat loss, arrival bounds, post-extinction puff continuity, eventual disappearance, replay and seek determinism.
- [x] Implement history/sampling helpers and wire history to overview and detailed scenes.
- [x] Animate independent flame opacity/size, fading glow/light and surviving smoke using a stable playback clock; preserve reduced-motion and pause behavior.
- [x] Check tests, types, changed-file lint and production build. Verify actual spraying, flame fade and lingering smoke in the browser, then save screenshots.

Keep particle capacities and backend/store semantics unchanged. No external assets or dependencies. No merge/push in this increment.

Verification: 28 tests pass; type check, ESLint and production build pass. Browser confirms spraying at step 1, residual heat at step 2, smoke without flames at step 4, eventual expiration, replay and overview switching with no console errors. Images: docs/verification/fire-cooling-transition.jpg and docs/verification/smoke-after-extinction.jpg. Backend/store and budgets unchanged.
