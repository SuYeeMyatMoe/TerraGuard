# Review fixes

The user authorized fixing the six findings in docs/REVIEW_2026-10-10_AR.md, on the existing codex/supabase-operational-records branch.

Keep file-backed predictions/simulation and backend-only database access. Pass the selected teams count in the optional action request field and recompute recommendations on the backend. Build simulation plots without operational status reads. Health reports database readiness and a degraded state on failed reads. Keep an independent actions loading/error state and retry control so failed reads cannot look like an empty audit log.

Update MapLibre to a patched release and Next/eslint together where needed; use a targeted dependency override only for compatible transitive fixes. Preserve library attribution. Do not use force-based npm remediation or downgrade major versions. Verify audit, types, lint, build, and map behavior.

The user explicitly answered “لا ما احتاج صفحة تسجيل دخول”. Retain the existing local demo access model; remove the proposed Auth module and tests and create no accounts. Bind the frontend dev/start commands to 127.0.0.1 and document the backend's loopback bind. This limits the standard local setup; it does not add authentication to FastAPI or make a public deployment safe. The frontend still calls the same API and contains no service key. Operational table RLS/grants remain closed to browser roles.

Verification uses failing regression tests first. Unit tests isolate all remote operations. Verify live readiness and transactional SQL assertions without leaving operational test records. Test the real browser's map/worker, 3D view, and audit failure/retry states. Distinguish production dependency audit results from development-only findings; do not suppress the remaining unpatched braces advisory or downgrade Next's lint configuration to an incompatible major just to silence audit.
