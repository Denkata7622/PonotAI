# PostgreSQL Migration Runbook (Railway)

## 1) Provision PostgreSQL on Railway
1. Add a PostgreSQL service in Railway.
2. Copy the connection string into backend `DATABASE_URL`.
3. Ensure backend service exposes:
   - `DATABASE_URL`
   - `PERSISTENCE_MODE=postgres`
   - `JWT_SECRET`
   - `ALLOWED_ORIGINS`
   - `ADMIN_EMAIL` (optional bootstrap)

## 2) Apply schema migration
Run Prisma migrations against Railway Postgres:

```bash
cd backend
npm run prisma:migrate:deploy
```

## 3) Import existing JSON runtime data
Run a dry run first:

```bash
cd backend
npm run db:migrate:json:dry-run
```

Then execute import:

```bash
cd backend
npm run db:migrate:json
```

The migration script performs real inserts into PostgreSQL and logs inserted/skipped/failed counts by domain.

## 4) Verify after import and cutover
- Check table counts match migration summary output.
- Verify auth and core user flows (history, favorites, playlists, shares, onboarding tags).
- Verify `/api/health` reports `runtime=postgresql` and `status=ok`.

## Notes
- JSON files are read as migration input only and are not runtime source-of-truth after cutover.
- Legacy file mode is explicit (`PERSISTENCE_MODE=file-legacy`) and development-only.
- Demo dataset in `src/data/demoSongs.json` remains static seed data.
