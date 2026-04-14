# Runtime Persistence Audit (Trackly / PonotAI)

## Scope audited
- `backend/src/db`
- `backend/src/modules/auth`
- `backend/src/modules/history`
- `backend/src/modules/favorites`
- `backend/src/modules/playlists`
- `backend/src/modules/library`
- `backend/src/modules/recognition`
- `backend/src/modules/share`
- `backend/src/modules/admin`
- `backend/src/modules/developer`
- `backend/src/modules/achievements`
- `backend/src/modules/ai`
- `backend/src/modules/demo`
- `backend/src/routes/assistant.ts`
- `backend/src/config/env.ts`
- `backend/src/app.ts`
- Prisma schema and package scripts

## Current runtime persistence architecture

### Core persistence helpers
1. `backend/src/db/persistence.ts`
   - Storage mode is inferred from presence of `DATABASE_URL`, but behavior is still file-only.
   - Reads/writes JSON files under `backend/data` (or `PONOTAI_DATA_DIR`).
2. `backend/src/db/authStore.ts`
   - **Authoritative runtime datastore** for most user and app state.
   - Persists all records to `appdb.json`.
3. `backend/src/db/client.ts`
   - Legacy global history store backed by `history.json`.

### Domain-by-domain persistence map

| Domain | Current source | Data shape | Scope | Authority |
|---|---|---|---|---|
| Users | `authStore.ts` (`appdb.json`) | `UserRecord` | Per-user/global list | Authoritative |
| Auth account data | `authStore.ts` | Password hash, role, profile | Per-user | Authoritative |
| Sessions | JWT only | Not persisted server-side | N/A | N/A |
| Favorites | `authStore.ts` | `FavoriteRecord[]` | Per-user | Authoritative |
| History (user) | `authStore.ts` | `SearchHistoryRecord[]` | Per-user | Authoritative |
| History (guest/global feed) | `client.ts` (`history.json`) | `HistoryEntry[]` | Global | Authoritative for guest |
| Playlists | `authStore.ts` | `PlaylistRecord[]` with embedded songs | Per-user | Authoritative |
| Playlist tracks | Embedded in playlist JSON | `PlaylistSongRecord[]` | Per-playlist | Authoritative |
| Queue | Not persisted backend | N/A | N/A | N/A |
| Settings/theme prefs | Not persisted backend | N/A | Client-side hints only | N/A |
| Track tags | `authStore.ts` | `TrackTagRecord[]` | Per-user | Authoritative |
| Achievements | `authStore.ts` | `AchievementRecord[]` | Per-user | Authoritative |
| Shares (song) | `authStore.ts` | `SharedSongRecord[]` | Per-user/global lookup by code | Authoritative |
| Shares (playlist) | `authStore.ts` | `SharedPlaylistRecord[]` | Per-user/global lookup by code | Authoritative |
| Shares (recognition) | `authStore.ts` | `SharedRecognitionRecord[]` | Per-user/global lookup by code | Authoritative |
| Developer API keys | `authStore.ts` | `ApiKeyRecord[]` | Per-user | Authoritative |
| Admin/demo account flags | `authStore.ts` users (`role`, `isDemo`) | User metadata | Per-user | Authoritative |
| AI conversation history | Not persisted | Computed from library/history | N/A | N/A |
| Onboarding/preferences profile | Not persisted backend | Included as request hints only | N/A | N/A |
| Stats snapshots | Not persisted | Computed live from history/users | Global | Derived |
| OCR/recognition persisted output | user history + optional guest history | Search history entries | Per-user/global | Authoritative |

## Relationship model in current JSON store

- `users` owns many `searchHistory`, `favorites`, `playlists`, `achievements`, `apiKeys`, `trackTags`, and shared entities.
- `playlists` embeds `songs`; there is no normalized playlist-tracks table.
- `sharedPlaylists` references `playlistId` but not enforced by FK.
- `sharedSongs` and `sharedRecognitions` duplicate track payload fields.
- `history.json` is separate from `appdb.json`, creating a split persistence model.

## Indirect persistence paths found
- `/api/history` guest mode writes `history.json` via `db/client.ts`.
- `/api/stats` mixes reads from `history.json` + `appdb.json` user history.
- `/api/admin/overview` composes aggregate snapshot entirely from `authStore.ts`.
- Assistant/AI modules consume persisted history/favorites/playlists/tags through `authStore.ts`.

## Migration target model (PostgreSQL source of truth)

Proposed normalized target:

- `users`
- `search_history`
- `legacy_history_entries` (for guest/global history feed continuity)
- `favorites`
- `playlists`
- `playlist_tracks`
- `shared_songs`
- `shared_playlists`
- `shared_recognitions`
- `achievements`
- `api_keys`
- `track_tags`

### Required constraints/indexes
- Unique: `users.email`, `users.username`
- Unique: `favorites(user_id, title, artist)`
- Unique: `track_tags(user_id, track_key)`
- Unique: `achievements(user_id, key)`
- Unique: `api_keys.key_prefix`, all share codes
- FK cascade from user-owned rows
- FK cascade from playlist to playlist_tracks and shared_playlists
- Indexes for `(user_id, created_at/updated_at)` lookup patterns

## Cutover goals
1. Remove runtime writes to JSON files in production path.
2. Replace `authStore.ts` and `client.ts` file IO with SQL-backed read/write.
3. Keep response contracts unchanged.
4. Provide idempotent JSON-to-PostgreSQL import utility.
5. Fail fast in production when DB connection/migrations are not ready.

## Active runtime JSON write paths

All runtime persistence writes are still JSON-file backed:

- `backend/src/db/authStore.ts` → writes `appdb.json` for users, auth records, history, favorites, shares, playlists, tags, achievements, API keys, and demo flags.
- `backend/src/db/client.ts` → writes `history.json` for legacy/global history feed.
- `backend/src/db/persistence.ts` → generic file helpers used by both stores above.

### Truthfulness check

- Prior behavior was **not truthful**: setting `DATABASE_URL` switched reported mode/health to `database_url` while runtime writes still targeted JSON files.
- Runtime persistence is currently file-backed; any mode/health response must report file persistence only until a real DB runtime store exists.
