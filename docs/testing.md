# Testing workflow (local + Codex)

Run all commands from the repository root.

## Core commands

- `npm run test` — runs backend and frontend automated tests.
- `npm run test:smoke` — runs backend smoke flows and frontend tests.
- `npm run test:backend` — runs backend TypeScript tests via backend-local `tsx`.
- `npm run test:frontend` — runs frontend smoke tests via frontend-local `tsx`.
- `npm run typecheck` — type-checks backend and frontend.
- `npm run lint` — runs frontend linting.
- `npm run build` — builds backend and frontend.

## Test isolation

Backend tests start the API with a temporary data directory created under the OS temp folder (`ponotai-tests-*`) and remove it after each test run.

- Data store path is injected with `PONOTAI_DATA_DIR`.
- No test writes to `backend/data/appdb.json` or developer real data.
- Tests use mock secrets (`JWT_SECRET=test-secret`) and test-only env defaults.

## External service behavior in tests

- Assistant tests do **not** call Gemini and expect `AI_SERVICE_UNAVAILABLE` when `GEMINI_API_KEY` is unset.
- Recognition smoke coverage uses request-validation paths and does not hit live provider APIs.
- No test depends on YouTube, weather, or third-party media APIs.

## Adding new tests with env vars

If a new test needs env vars:

1. Add the vars in `backend/tests/helpers/testHarness.ts`.
2. Keep values test-only and deterministic.
3. Clear the vars in the harness `close()` cleanup to avoid cross-test leaks.
