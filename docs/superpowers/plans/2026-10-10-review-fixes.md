# Review Fixes Implementation Plan

> Execute inline; the user authorized implementation and explicitly requested no login page.

**Goal:** Fix operational and runtime dependency findings with regression coverage; preserve the user's local access choice and document its limits.

**Architecture:** Separate file-backed calculations from cloud operational state, validate the action context on the backend, expose operational readiness, and represent audit read failures in the UI. Run the standard local setup on loopback without adding login. Keep the database client backend-only.

**Tech Stack:** FastAPI/Pydantic/httpx, Supabase PostgREST, Next/React/Zustand, Node test runner, pytest.

- [x] Add API regression tests: simulate succeeds when db.status_map raises; health degrades when operational readiness raises; audit recommendation respects teams=0. Observe failures before implementation.
- [x] Implement backend contracts. Readiness is a bounded read-only GET /actions limit=1 with a three-second timeout.
- [x] Add frontend Node tests executing the real store/api modules after TypeScript transpilation. Observe failures for loading/error/retry and teams forwarding.
- [x] Implement independent audit loading/error/retry state and teams forwarding; start audit loading before awaiting incident/prediction requests.
- [x] Apply the user's explicit no-login choice: remove the Auth module/tests, create no accounts, bind frontend scripts to loopback and document unauthenticated API limits.
- [x] Update MapLibre to 6.13.0 and Next/eslint-config-next to 16.4.0. Follow primary migration docs for ESM imports, emitted worker URL, ESLint flat config and TS JSX runtime. Fix the React issues surfaced by the updated lint rules.
- [x] Verify 45 backend tests, 4 frontend tests, lint and production build. Production npm audit: zero findings. Full audit: five development-package entries for the single unpatched braces advisory; document it without suppression.
- [x] Verify live Supabase reads, SQL transaction assertions (ROLLBACK), browser map/3D rendering and failed audit fetch/retry. Preserve all operational records; verification leaves the three tables empty.
- [x] Update API/Supabase documentation and review disposition. Review the diff and save fixes on codex/supabase-operational-records.
