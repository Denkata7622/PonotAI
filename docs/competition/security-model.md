# Security model (STRIDE-lite)

Date: 2026-03-30  
Scope: backend authentication (`/api/auth/*`) and recognition uploads (`/api/recognition/audio`, `/api/recognition/image`).

## System boundaries and trust zones

1. **Client zone (untrusted):** Browser/mobile clients submit credentials, JWT bearer tokens, and upload files.
2. **API zone (trusted runtime):** Express backend validates input, enforces auth and rate limits, processes files in-memory, and calls providers.
3. **Data zone (trusted persistent):** User records and history store.
4. **Third-party zone (partially trusted):** Recognition providers and YouTube metadata APIs.

Primary entry points:
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET/PATCH/DELETE /api/auth/me`
- `POST /api/auth/change-password`
- `POST /api/recognition/audio` (multipart, field `audio`)
- `POST /api/recognition/image` (multipart, field `image`)

## Auth flow (actual)

1. Client sends email/password to `/api/auth/login`.
2. Backend looks up user by email and verifies password hash with `scrypt` + timing-safe comparison.
3. Backend returns signed token containing `{ sub, exp }`.
4. Protected endpoints read `Authorization: Bearer <token>` and validate signature + expiry.
5. In production, startup fails if `JWT_SECRET` is missing.

## Upload flow (actual)

1. Client uploads multipart audio/image to recognition routes.
2. Multer accepts only `audio/*` or `image/*` mimetypes and enforces size caps (audio 15 MB, image 10 MB).
3. File is processed in memory and passed to recognition service.
4. Service may call external providers; successful results are written to history.
5. General recognition limiter and endpoint-specific controls reduce abuse potential.

## STRIDE-lite threat table

| STRIDE | Threat in this system | Current mitigation in code | Residual risk |
|---|---|---|---|
| **S**poofing | Stolen/forged identity token used on protected endpoints. | HMAC-signed tokens with expiry; auth middleware rejects missing/invalid bearer tokens. | Token theft on compromised client remains possible; no token revocation list. |
| **T**ampering | Upload payload manipulation or malformed files sent to processing pipeline. | Multer field + mimetype filtering and file size limits; centralized error middleware. | Mimetype spoofing can still occur; deep content validation/sandboxing not present. |
| **R**epudiation | User denies sensitive actions (profile update, password change, uploads). | Route structure and status codes are deterministic; response-time header assists operational tracing. | No immutable audit log or request-ID correlation in current scope. |
| **I**nformation disclosure | Leakage of stack details, weak headers, or secrets in misconfigured production. | Helmet security headers; production startup validation for `JWT_SECRET`; CORS allowlist. | Verbose error `details` on some 500 paths may reveal internals; third-party metadata leakage risk persists. |
| **D**enial of service | Brute-force login and high-volume recognition uploads. | Login-specific brute-force limiter; recognition rate limiter; upload size caps. | In-memory limiter is per-process (not shared across replicas) and resets on restart. |
| **E**levation of privilege | Unauthorized access to `/api/auth/me` and other protected mutations. | `requireAuth` middleware validates signature+expiry and binds `req.userId`. | Compromised valid tokens still inherit user privileges until expiry. |

## Security controls checklist (implemented)

- [x] Production secret hard-fail (`JWT_SECRET`).
- [x] Secure baseline headers via Helmet.
- [x] Login brute-force limiter on `POST /api/auth/login`.
- [x] Recognition abuse limiter on `/api/recognition/*`.
- [x] Upload type and size restrictions.
- [x] Password hashing with per-password salt and timing-safe verify.
- [x] CORS allowlist enforcement.

## Secret-management policy (competition scope)

1. Never commit `.env` files containing real secrets.
2. Store production secrets only in deployment environment variables.
3. Rotate `JWT_SECRET` immediately after any suspected leak.
4. Use distinct secrets per environment (dev/staging/prod).
5. Treat API provider keys as secrets; avoid logging them.

## Recommended next hardening steps (post-competition)

1. Add distributed rate limiting (e.g., Redis-backed) for multi-instance deployments.
2. Add token revocation/session tracking for logout-all and incident response.
3. Add request IDs + append-only audit events for sensitive auth/profile actions.
4. Add malware/content scanning for uploads before deeper processing.
5. Normalize error responses to avoid leaking internal exception details.
