# Runtime Persistence Audit (Trackly/PonotAI)

Date: 2026-04-14

## Scope reviewed
- `backend/src/db/authStore.ts` (users/auth, history, favorites, playlists, shares, tags, achievements, admin snapshots, API keys)
- `backend/src/db/client.ts` (legacy history store)
- `backend/src/db/persistence.ts` (persistence abstraction)
- Runtime modules that call the above stores via auth/history/playlists/admin flows.

## Findings
- Active runtime writes are file-backed JSON documents (`appdb.json`, `history.json`) through `readJsonDocument`/`writeJsonDocument`.
- `DATABASE_URL` is not used by runtime repositories in the active request path.
- Postgres references in this repo are migration/tooling-oriented only and not runtime persistence wiring.

## Decision for this pass
Use **truthful file-backed runtime semantics** (not partial Postgres runtime migration):
1. Keep runtime persistence mode fixed to file-backed JSON.
2. Ensure health/config messaging does not imply runtime DB-backed persistence.
3. Keep `DATABASE_URL` semantics explicit: migration tooling only in current runtime.

This avoids deceptive operational behavior while preserving a safe, correct production runtime.
