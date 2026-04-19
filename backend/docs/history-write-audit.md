# LegacyHistoryEntry write-path audit (PostgreSQL runtime)

Date: 2026-04-14

## Scope reviewed

- `backend/prisma/schema.prisma`
- `backend/src/db/client.ts`
- `backend/src/modules/history/history.service.ts`
- `backend/src/modules/history/history.controller.ts`
- `backend/src/modules/recognition/recognition.controller.ts`
- Assistant/library sync request and trigger paths in frontend + backend

## Findings

1. `LegacyHistoryEntry.id` is caller-supplied and required (`String @id`) in Prisma.
2. `addHistoryEntry` creates one new UUID, but then calls `writeHistory(next)` where `next` is the entire global feed.
3. `writeHistory` performs:
   - `deleteMany({})`
   - `createMany({ data: entries[...] })` with explicit IDs for **all** rows.
4. Under overlapping requests, two concurrent transactions can both attempt to re-insert many of the same legacy IDs into `LegacyHistoryEntry`, producing `P2002` on `id`.
5. OCR image flows magnify this behavior by triggering multiple history writes in a loop (`for (const song of result.songs)`), increasing overlap probability.
6. History controllers are async Express handlers without route-level async error wrapping; rejected promises can bypass structured route responses.
7. Assistant/provider double logs are partly expected from retry instrumentation (`provider attempt` logs once per attempt). Library sync double logs indicate duplicate action invocations should still be guarded at the UI action layer.

## Root cause summary

Primary root cause is not OCR quality and not UUID generation itself; it is **bulk destructive rewrite semantics** (`deleteMany + createMany`) for a feed that receives concurrent writes. This pattern is conflict-prone on PostgreSQL and triggers `P2002` during overlapping inserts of previously existing IDs.
