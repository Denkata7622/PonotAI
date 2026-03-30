# Coding Standards (Trackly)

These standards reflect conventions used in the current codebase and should be followed for new work.

## 1) Naming conventions

### TypeScript/JavaScript
- Use **camelCase** for variables/functions (`handlePlaySong`, `normalizeTrackKey`).
- Use **PascalCase** for React components/types (`HomeContent`, `PlaylistDetail`, `QueueTrack`).
- Use **UPPER_SNAKE_CASE** for module constants (`STORAGE_KEY`, `OCR_CHAR_WHITELIST`).
- Route/controller/service files should use module naming:
  - `*.routes.ts`
  - `*.controller.ts`
  - `*.service.ts`

### Routes and paths
- Frontend routes use Next.js App Router directory naming (`/library`, `/search`, `/shared/[shareCode]`).
- Backend API route prefixes use `/api/<resource>` with plural resources where applicable (`/api/playlists`, `/api/favorites`).

## 2) Layering and module boundaries

### Frontend layering
- **Route pages** under `frontend/app/**` should primarily delegate to page client/components.
- **Feature logic** belongs in `frontend/features/**` hooks/APIs/types.
- **Reusable UI components** belong in `frontend/components/**` and `frontend/src/components/ui/**`.
- Shared utilities belong in `frontend/lib/**` or `frontend/src/lib/**`.

### Backend layering
- Keep HTTP wiring in `*.routes.ts`.
- Keep request/response handling in controllers.
- Keep recognition/business logic in services.
- Keep persistence helpers in `backend/src/db/**`.

## 3) Error handling conventions

### Backend
- Validate inputs early and return explicit status codes (`400`, `401`, `404`, `409`, `500`).
- Return machine-readable error objects consistently (existing code uses `error`, `message`, and `code`; prefer stable `code` for new endpoints).
- Use centralized `errorMiddleware` for uncaught route errors.
- Avoid leaking sensitive runtime data in error messages.

### Frontend
- Handle API failures with graceful UI fallback states (empty/error messaging and toasts).
- Preserve UX continuity: localStorage fallback when backend is unavailable (history/library patterns).
- For async flows, always set loading and clear loading in `finally`/completion paths.

## 4) Testing conventions

### Test stack
- Use Node built-in test runner (`node --test --experimental-strip-types`) for TS tests in both backend/frontend test directories.
- Keep tests under:
  - `backend/tests/**/*.test.ts`
  - `frontend/tests/**/*.test.ts`

### Test coverage expectations
- Each feature change should include at least one of:
  1. unit test for utility/service logic,
  2. integration test for flow behavior,
  3. documented manual acceptance scenario when automation is not yet feasible.

### Test naming
- Name tests by behavior (`shouldRetryStatus retries on 429 and 5xx`, `upsertTrack prevents duplicates`).
- Prefer deterministic test inputs and avoid network calls in tests.

## 5) i18n conventions
- UI strings should use translation keys via `t(key, language)`.
- Add keys to all supported locales in `frontend/lib/translations.ts`.
- Run `node frontend/scripts/check-i18n-keys.mjs` before merge to detect missing locale keys.

## 6) Commit and review conventions
- Keep commits focused and descriptive (single concern per commit when feasible).
- Reference affected module/feature in commit message.
- Before opening a PR, run lint/tests relevant to changed areas and document any expected limitations.
