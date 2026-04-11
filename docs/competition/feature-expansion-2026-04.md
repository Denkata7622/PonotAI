# Trackly Feature Expansion (April 2026)

This iteration extends Trackly with competition-oriented capabilities while preserving existing architecture.

## Highlights
- Public sharing now supports **songs**, **recognition results**, and **playlists** with read-only views and ownership checks.
- Recognition pipeline now exposes structured entry points for **live recording**, **humming (experimental)**, and **video-based recognition**.
- Added server-tracked **achievements** and streak-oriented milestones (first recognition, playlist curator, 7-day activity, etc.).
- Added **fuzzy internal search** endpoint for typo tolerance across user history, favorites, and playlists.
- Added secure **versioned library report export** endpoint (`/api/library/report`) with safe data fields only.
- Added protected **admin APIs** for overview + demo-account generation.
- Added **developer API key management** and x-api-key protected public developer endpoints for recognition and recommendations.

## Security posture improvements
- New features enforce ownership and auth checks server-side.
- Developer API keys are stored as SHA-256 hashes (prefix only exposed for management).
- Admin routes require explicit role-based authorization.
- Public share responses are intentionally sanitized and avoid exposing private fields.

## Onboarding / judging flow
- Admin can generate realistic demo personas (`gym`, `indie`, `nostalgia`) with coherent playlists, favorites, and history.
- Frontend includes dedicated pages for Achievements, Admin, and Developer API onboarding.
