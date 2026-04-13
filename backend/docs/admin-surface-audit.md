# Admin Surface Audit (Trackly)

Date: 2026-04-13

## Existing admin capabilities

### Backend routes (`/api/admin`)
- `GET /overview`:
  - Totals for users, playlists, shares, recognitions, demo accounts, achievements, API keys.
  - Recent users, signups, recognitions, playlists, and shares.
  - Demo profile recap for recently generated demo users.
  - Developer API key list with key prefix/status.
  - Basic AI status from env (`gemini` vs `fallback`) and assistant request count derived from history method.
- `GET /demo-personas`:
  - Lists available demo persona templates.
- `GET /developer-keys/:userId`:
  - Lists a user's API key metadata (no raw keys).
- `POST /demo-account`:
  - Generates and seeds a demo account with one-time plaintext credential response.

All admin routes are protected by `requireAuth` + `requireAdmin` middleware.

### Frontend admin page
- Header + 8 metric cards.
- Demo account creation by persona only.
- One-time credential reveal + clipboard copy actions.
- Recent demo profiles list.
- Simple activity recap lists.
- Basic AI/provider and API key list panel.

## High-value operational gaps

1. Visibility is shallow:
   - No time-windowed trends.
   - No favorites/history distribution or playlist depth insights.
   - No user role/demo ratios beyond simple total.

2. AI/OCR diagnostics are weak:
   - `recentFailures` is hardcoded `0`.
   - No provider availability matrix.
   - No OCR-path visibility despite OCR fallback behavior in recognition pipeline.

3. Demo tooling is coarse:
   - Persona is the only input; no configurable seeding scale/activity window.
   - No deterministic seed control for reproducible demos.

4. Developer API observability is limited:
   - No active vs revoked summary rates.
   - No key activity recency buckets.

5. System health is underrepresented:
   - `/api/health` exists but admin page does not expose subsystem state categories.

6. UX hierarchy:
   - Useful data exists but is grouped loosely; no control-center information architecture.
