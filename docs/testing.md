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

Full backend tests run against PostgreSQL. They require `TEST_DATABASE_URL` to point at a separate disposable test database.

- `backend/scripts/run-tests.mjs` refuses to fall back to `DATABASE_URL`.
- In `NODE_ENV=test`, the backend maps `TEST_DATABASE_URL` to Prisma's `DATABASE_URL`.
- No test should point at production or shared staging data.
- Tests use mock secrets (`JWT_SECRET=test-secret`) and test-only env defaults.

Example `backend/.env.test`:

```env
NODE_ENV=test
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/ponotai_test?schema=public
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/ponotai_test?schema=public
TEST_PERSISTENCE_MODE=postgres
JWT_SECRET=test-secret
AUTH_BYPASS_EMAIL_VERIFICATION=true
```

GitHub Actions starts a disposable Postgres service and uses the same URL shape with `localhost`.

## External service behavior in tests

- Assistant tests do **not** call Gemini and expect `AI_SERVICE_UNAVAILABLE` when `GEMINI_API_KEY` is unset.
- Recognition smoke coverage uses request-validation paths and does not hit live provider APIs.
- No test depends on YouTube, weather, or third-party media APIs.

## Adding new tests with env vars

If a new test needs env vars:

1. Add the vars in `backend/tests/helpers/testHarness.ts`.
2. Keep values test-only and deterministic.
3. Clear the vars in the harness `close()` cleanup to avoid cross-test leaks.
