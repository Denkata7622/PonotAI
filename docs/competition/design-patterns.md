# Design Patterns Catalog (Trackly)

This catalog documents concrete pattern usage in the current codebase only.

## 1) Provider Pattern (React Context Providers)
- **Intent:** Share cross-cutting app state without prop drilling.
- **Where used:** `PlayerProvider`, `LanguageProvider`, `ThemeContext`, `ProfileContext`, `UserContext`.
- **Module references:** `frontend/components/PlayerProvider.tsx`, `frontend/lib/LanguageContext.tsx`, `frontend/lib/ThemeContext.tsx`, `frontend/lib/ProfileContext.tsx`, `frontend/src/context/UserContext.tsx`.
- **Benefits:** Consistent state APIs across routes; centralized side effects (player persistence, auth state, language/theme).
- **Trade-offs:** Harder isolated component testing when providers are deeply nested.

## 2) Strategy Pattern (Recognition provider fallback chain)
- **Intent:** Select one recognition algorithm/provider among interchangeable strategies.
- **Where used:** Audio recognition path chooses between AuDD, ACRCloud, Shazam/mock and fallback logic.
- **Module references:** `backend/src/modules/recognition/recognition.service.ts`, `backend/src/modules/recognition/providers/audd.provider.ts`, `backend/src/modules/recognition/providers/acrcloud.provider.ts`, `backend/src/modules/recognition/providers/shazam.provider.ts`, `backend/src/modules/recognition/providers/bulgarian.provider.ts`.
- **Benefits:** Provider-specific logic is encapsulated and replaceable.
- **Trade-offs:** More branching and config complexity in orchestration service.

## 3) Router–Controller–Service Layering (MVC-like)
- **Intent:** Separate transport concerns from business logic.
- **Where used:** Backend modules split `*.routes.ts` → `*.controller.ts` → `*.service.ts`.
- **Module references:**
  - Recognition: `recognition.routes.ts`, `recognition.controller.ts`, `recognition.service.ts`
  - History: `history.routes.ts`, `history.controller.ts`, `history.service.ts`
  - Stats: `stats.routes.ts`, `stats.controller.ts`, `stats.service.ts`
- **Benefits:** Clear responsibilities and easier route-level testing.
- **Trade-offs:** Slightly more boilerplate for small features.

## 4) Adapter Pattern (data-shape normalization)
- **Intent:** Convert heterogeneous payloads into a common app shape.
- **Where used:**
  - Recognition response mapping (`toProviderResponse`, `toFallbackResponse`).
  - Frontend `normalizeSong()` for mixed local/backend song shapes.
  - Artist-display formatting (`formatArtist`) for YouTube “- Topic” cleanup.
- **Module references:** `backend/src/modules/recognition/recognition.service.ts`, `frontend/app/library/PageClient.tsx`, `frontend/lib/formatArtist.ts`.
- **Benefits:** UI consumes stable structures despite source variability.
- **Trade-offs:** Adapters must be maintained as external payloads evolve.

## 5) Observer/Event-driven Pattern (state sync via listeners/effects)
- **Intent:** React to state and browser events to keep UI synchronized.
- **Where used:**
  - `storage` event sync in `AppShell`.
  - YouTube player event callbacks in `PlayerProvider` (`onReady`, `onError`, `onStateChange`).
  - React `useEffect` chains for debounced search and persistence.
- **Module references:** `frontend/components/AppShell.tsx`, `frontend/components/PlayerProvider.tsx`, `frontend/app/search/PageClient.tsx`.
- **Benefits:** Real-time updates without explicit polling.
- **Trade-offs:** Event sequencing bugs are possible if dependencies drift.

## 6) Facade Pattern (feature hooks wrapping storage/API complexity)
- **Intent:** Present simple APIs to components while hiding implementation details.
- **Where used:**
  - `useLibrary` exposes favorites/playlists actions for authenticated and guest modes.
  - `apiFetch` centralizes base URL + auth token handling.
- **Module references:** `frontend/features/library/useLibrary.ts`, `frontend/features/library/api.ts`, `frontend/src/lib/apiFetch.ts`.
- **Benefits:** Components remain UI-focused; reduced duplicate request logic.
- **Trade-offs:** Facade growth can create large “god hooks” if not split over time.

## 7) Dedupe/Idempotency Utility Pattern (functional utility)
- **Intent:** Enforce deterministic uniqueness and avoid duplicate user-visible entities.
- **Where used:**
  - `dedupeByTrack`, `normalizeTrackKey` for history/favorites.
  - `upsertTrack` for queue insertion without duplicates.
- **Module references:** `frontend/lib/dedupe.ts`, `frontend/features/player/state.ts`, `frontend/app/library/PageClient.tsx`, `frontend/components/HomeContent.tsx`.
- **Benefits:** Stable UX and repeatable behavior across flows.
- **Trade-offs:** Requires consistent keying assumptions (title/artist normalization).
