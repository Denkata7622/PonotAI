# Prisma Toolchain Audit (Packaging + Script Context)

## Scope reviewed
- `backend/package.json` Prisma dependency declarations and script lifecycle.
- Root `package.json` script entrypoints that dispatch into `backend` via `--prefix`.
- Railway contract in `README.md` (`backend` root directory, `npm install && npm run build`, then `npm run start`).
- Runtime imports from `@prisma/client` (`backend/src/db/prisma.ts`).

## Findings
1. **Backend scripts invoke Prisma CLI directly (`prisma ...`)** in:
   - `prisma:generate`
   - `prisma:migrate:deploy`
   - `postinstall`
   - `pretest`
   - `prestart`
   - build chain (`build` includes `npm run prisma:generate`)

2. **The backend currently expects `prisma` binary resolution via PATH/npm script shim**.
   - This is sensitive to install shape and dependency pruning.
   - In environments where the CLI package is not installed in backend runtime context, this fails with `prisma: not found`.

3. **Runtime start path unnecessarily requires Prisma CLI**.
   - `prestart` runs Prisma generation even though application runtime only imports generated client (`@prisma/client`) and does not need CLI commands during normal startup.

4. **Railway lifecycle implications**.
   - Build and test are CLI-relevant stages.
   - Production start should consume already generated artifacts and not be blocked by missing CLI.

## Root cause summary
The blocker is not the PostgreSQL migration logic. The blocker is lifecycle/tooling wiring: Prisma CLI invocation is required in script phases where it may be unavailable (especially runtime startup/install variants), and script resolution currently depends on binary availability assumptions that are not guaranteed across package contexts.
