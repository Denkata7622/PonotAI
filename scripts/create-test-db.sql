-- Disposable local PostgreSQL database for backend tests.
-- Run as a Postgres superuser or database owner:
--   psql -U postgres -f scripts/create-test-db.sql

SELECT 'CREATE DATABASE ponotai_test'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'ponotai_test')\gexec

