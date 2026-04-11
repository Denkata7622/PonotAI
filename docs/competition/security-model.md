# Trackly Security Model (Updated April 11, 2026)

## Implemented protections

- **Auth tokens**: HMAC-signed bearer tokens with expiry; protected routes enforce `requireAuth`.
- **Ownership checks**: User-scoped access is enforced in playlists/favorites/history/library/share handlers via `req.userId`.
- **Rate limiting**:
  - Global API limiter (`/api`): 100 req/min/IP.
  - Auth-sensitive limiter: 10 req/15min/IP.
  - Recognition limiter: 30 req/min/IP.
  - Assistant-specific limiter: 12 req/min/IP (+ per-user cap in assistant route).
- **Security headers**: Helmet with frameguard, nosniff, CSP defaults, and HSTS.
- **CORS**: allowlist-based origin checks with explicit allowed headers and credentials enabled only for allowed origins.
- **Environment validation**:
  - Production hard-fail if `JWT_SECRET` is missing.
  - Production hard-fail if `ALLOWED_ORIGINS` is missing.
  - Warnings for missing `GEMINI_API_KEY`/`DATABASE_URL`/provider keys.
- **Import/export safety (frontend)**:
  - Versioned export schema (`version: 1`) with metadata.
  - Import has JSON parsing guards, max file size limit, schema checks, and normalization/deduping.
  - Sensitive fields (tokens/password hashes/secrets) are excluded from exports.

## Remaining risks

1. In-memory rate limit buckets are not shared across multiple backend instances.
2. Token revocation is not implemented (tokens remain valid until expiry).
3. Import currently trusts plain text fields and truncation/escaping by render path; deep content sanitization can be tightened further.
4. CSP still allows `'unsafe-inline'` for scripts/styles to preserve current UI behavior.

## Recommended next hardening steps

1. Move rate-limiter state to Redis.
2. Add refresh-token rotation and token revocation list.
3. Replace inline CSP exceptions with nonce/hash strategy.
4. Add centralized schema validation utility for all write routes.
