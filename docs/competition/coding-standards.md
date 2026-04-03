# Coding Standards (Actual, Tool-Backed vs Convention)

This document reflects what is **currently enforced by configuration** in this repository.

## Standards enforced automatically

### 1) Frontend ESLint (`frontend/eslint.config.mjs`)
- Base rule sets: `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`.
- Important rules explicitly turned **off** in current config:
  - `@typescript-eslint/no-explicit-any`
  - `@typescript-eslint/no-unused-vars`
  - `@typescript-eslint/no-namespace`
  - `@next/next/no-img-element`
  - `react/no-unescaped-entities`
  - `react-hooks/exhaustive-deps`
  - `react-hooks/set-state-in-effect`
  - `react-hooks/preserve-manual-memoization`
  - `prefer-const`
- Ignore paths: `.next/**`, `out/**`, `build/**`, `next-env.d.ts`.

### 2) TypeScript compiler settings

**Frontend (`frontend/tsconfig.json`)**
- `strict: true`.
- `moduleResolution: "bundler"`.
- `jsx: "react-jsx"`.
- `noEmit: true` (compile checks only).
- `allowJs: true`, `skipLibCheck: true`.
- Path aliases include `@/*`, plus local shims for `lucide-react` and `recharts`.

**Backend (`backend/tsconfig.json`)**
- `strict: true`.
- `module: "CommonJS"`, `moduleResolution: "Node"`.
- Output to `dist/` from `src/`.
- `esModuleInterop: true`, `skipLibCheck: true`.

### 3) Automatically enforced by runtime middleware (backend)
- Security headers via `helmet()`.
- CORS allowlist checking.
- Global JSON parsing and centralized error middleware.
- Recognition and login rate-limit middleware.

## Standards enforced by convention

### 1) Naming conventions (observed in source)
- Functions/variables: `camelCase` (e.g., `handleCreatePlaylist`, `normalizeSong`).
- React components/types: `PascalCase` (e.g., `HomeContent`, `PlaylistDetail`, `UserProvider`).
- Constant values: `UPPER_SNAKE_CASE` (e.g., `USERNAME_REGEX`, `TOKEN_KEY`, `OCR_CHAR_WHITELIST`).
- Backend module files follow functional split: `*.routes.ts`, `*.controller.ts`, `*.service.ts`.

### 2) Folder structure conventions (observed)
- Frontend pages/routes in `frontend/app/**`.
- Frontend reusable components in `frontend/components/**` and `frontend/src/components/ui/**`.
- Frontend feature logic in `frontend/features/**`.
- Backend domain modules in `backend/src/modules/**`.
- Backend cross-cutting middleware in `backend/src/middlewares/**`.

### 3) Error handling conventions
- Backend commonly uses `sendError(req, res, status, code, details?)` from `errorCatalog`.
- Routes return stable `code` values for machine-readable handling.
- Frontend catches API failures and shows UI fallback/toast/error text.

### 4) Import ordering / component structure
- No explicit import-order lint plugin/config is present.
- Component structure is consistent by convention: imports → types → component/state/hooks → handlers → JSX return.

### 5) Formatting tools
- No `.prettierrc` file is present in this repository at the time of writing.
- Formatting consistency is therefore convention-driven plus editor defaults.
