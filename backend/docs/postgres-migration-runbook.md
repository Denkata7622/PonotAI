# PostgreSQL Migration Runbook (Railway)

## 1) Provision PostgreSQL on Railway
1. Add a PostgreSQL service in Railway.
2. Copy the connection string into backend `DATABASE_URL`.
3. Ensure backend service exposes:
   - `DATABASE_URL`
   - `JWT_SECRET`
   - `ALLOWED_ORIGINS`
   - `ADMIN_EMAIL` (optional bootstrap)

## 2) Apply schema migration
Use SQL in `backend/prisma/migrations/20260413114000_postgres_runtime/migration.sql` against Railway Postgres.

## 3) Export JSON data into SQL
Generate import SQL from existing runtime JSON:

```bash
cd backend
npm run db:migrate:json
```

The script writes `backend/tmp/json-to-postgres.sql` and prints per-domain row counts.

## 4) Import data into Railway
Run the generated SQL via your preferred PostgreSQL client against the Railway database.

## 5) Verify after import
- Check table counts match the migration summary.
- Verify user/auth and library endpoints with a known account.
- Verify `/api/health` reports DB connectivity once runtime cutover is complete.

## Notes
- JSON files are not deleted by the import script.
- The generated SQL uses `ON CONFLICT DO NOTHING` and can be re-run safely.
- Demo dataset in `src/data/demoSongs.json` is static seed data, not runtime persistence.
