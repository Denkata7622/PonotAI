# Prisma runtime/tooling audit (PostgreSQL migration hardening)

## Scope audited
- Dependency declarations and lockfile behavior.
- Prisma client generation and runtime import path (`@prisma/client` → generated `.prisma/client`).
- Build/start/test script ordering.
- Test harness startup defaults.
- Railway build/start assumptions from project docs.

## Root cause of prior `MODULE_NOT_FOUND`
The backend imports `PrismaClient` at runtime from `@prisma/client` (`src/db/prisma.ts`). If the generated client artifacts are missing, Node fails during startup with a module resolution error before any route logic runs.

The fragility came from a combination of issues:
1. `src/types/prisma-client.d.ts` declared a fake permissive module for `@prisma/client`, so TypeScript could compile even when runtime client availability was broken.
2. Prisma generation was tied to `npm run build` only; direct `npm run start`/`npm run test` paths could run without guaranteed generate.
3. Test harness defaulted to legacy file mode, masking Prisma startup regressions in many tests.
4. Prisma CLI availability depended on development dependency installation, which is not guaranteed in all CI/deploy modes.

## Hardening decisions
1. Remove fake Prisma typing shim so type system matches runtime reality.
2. Make Prisma CLI/runtime dependencies available in real runtime/tooling paths.
3. Guarantee `prisma generate` before start/test/build.
4. Add explicit PostgreSQL integration flow test (opt-in via `TEST_DATABASE_URL`) to validate migrated domains end-to-end on Postgres.
5. Keep startup/health behavior truthful and Postgres-first.
