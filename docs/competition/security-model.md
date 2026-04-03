# Security model (STRIDE-lite, verified against code)

Date: 2026-04-03
Scope: Express backend auth, API surface, upload handling, and third-party API key usage.

## System boundaries and trust zones

1. **Client zone (untrusted):** Browser/mobile clients submit credentials, bearer tokens, and multipart uploads.
2. **API zone (trusted runtime):** Express app handles auth, CORS, security headers, rate limiting, and request processing.
3. **Data zone (trusted persistence):** user/profile/favorites/playlists/history/shared-song records in the backend store.
4. **External provider zone (partially trusted):** AuDD, ACRCloud, YouTube Data API, optional Shazam client.

## Verified auth flow (actual code path)

1. User submits credentials to `POST /api/auth/login`.
2. Password hashes are verified using `crypto.scryptSync` and `crypto.timingSafeEqual`.
3. Backend signs token payload `{ sub, exp }` via HMAC-SHA256.
4. Protected routes call `requireAuth` and reject absent/invalid/expired bearer tokens.
5. JWT secret handling:
   - Production: process exits with `FATAL: JWT_SECRET environment variable is required in production` when missing.
   - Non-production: default fallback secret is allowed with warning `WARN: Using default JWT_SECRET — do not use in production`.

## Verified upload handling (actual code path)

- `POST /api/recognition/audio`:
  - `multer.memoryStorage()` in-memory processing.
  - MIME gate: only `audio/*`.
  - File size cap: 15 MB.
- `POST /api/recognition/image`:
  - MIME gate: only `image/*`.
  - File size cap: 10 MB.

## Verified API key usage

- `AUDD_API_TOKEN` / `AUDD_API_KEY`: sent server-side to AuDD via form-data; never returned in API responses.
- `YOUTUBE_API_KEY`: used server-side for YouTube search enrichment.
- `ACRCLOUD_ACCESS_KEY`, `ACRCLOUD_ACCESS_SECRET`, `ACRCLOUD_HOST`: used server-side for signed ACRCloud requests.
- Missing provider keys degrade recognition paths, but key material is not exposed to clients in normal responses.

## STRIDE-lite threat model

| Threat class | Attack surface | Mitigations implemented | Residual risk |
|---|---|---|---|
| **Spoofing** | Auth bypass via forged bearer token. | HMAC signature validation + token expiry + `requireAuth` enforcement on protected routes. | Stolen valid token remains usable until expiry (no revocation list). |
| **Tampering** | Manipulated request payloads or crafted upload files. | Input validation on auth/profile payloads; multer MIME + size limits; centralized error responses. | MIME spoofing is still possible without deep file content verification/sandbox scanning. |
| **Information Disclosure** | Secret/API key leakage or sensitive response leakage. | Secrets read from env only; production JWT secret hard-fail; Helmet + CORS allowlist reduce passive leakage. | Internal error `details` fields may expose limited internals on some 500 paths; third-party provider metadata still leaves backend boundary. |
| **Denial of Service** | Brute-force auth, API flooding, upload abuse. | `/api` rate limit (100 req/min/IP), strict auth endpoint rate limit (10 req/15min/IP), recognition limiter (30 req/min/IP), upload size limits. | In-memory limiters are per-process and reset on restart; not globally shared across replicas. |
| **Elevation of Privilege** | Accessing user-scoped operations without auth. | `requireAuth` middleware attached to sensitive routers/routes (`/favorites`, `/library`, `/playlists`, mutating auth endpoints, etc.). | Any accidental future route added without middleware could create exposure if not caught in review/tests. |

## Route authorization matrix (verified)

### Routes that require auth

- `GET /api/auth/me`
- `PATCH /api/auth/me`
- `POST /api/auth/change-password`
- `DELETE /api/auth/me`
- `POST /api/share`
- `GET /api/favorites`
- `POST /api/favorites`
- `DELETE /api/favorites/:id`
- `POST /api/library/sync`
- `GET /api/library`
- `GET /api/playlists`
- `POST /api/playlists`
- `GET /api/playlists/:playlistId`
- `PATCH /api/playlists/:playlistId`
- `POST /api/playlists/:playlistId/songs`
- `DELETE /api/playlists/:playlistId/songs`
- `DELETE /api/playlists/:playlistId`
- `DELETE /api/history/:id`
- `DELETE /api/history`

### Intentionally public routes

- `GET /health`
- `GET /docs`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/share/:shareCode`
- `GET /api/stats/global`
- `POST /api/recognition/audio`
- `POST /api/recognition/image`
- `GET /api/history`
- `POST /api/history` (guest-compatible via `attachUserIfPresent`)

## Residual-risk summary and next hardening steps

1. Move rate limiters to distributed storage (Redis) for horizontally scaled deployments.
2. Add token/session revocation for incident response.
3. Add request-id propagation and immutable audit logging for sensitive actions.
4. Add deep file-type verification and malware scanning before heavy processing.
5. Reduce 500-class error detail exposure in production responses.
