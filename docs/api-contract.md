# API Contract

This document is a developer-facing quick reference. For the full machine-readable contract, use `backend/openapi.yaml` and Swagger UI at `GET /docs`.

## Base
- Backend base URL: `${API_BASE_URL}`
- Health checks:
  - `GET /health`
  - `GET /api/health`

## Authentication models
- **Session/Bearer endpoints**: require logged-in user token (`Authorization: Bearer <token>`).
- **Developer key endpoints**: require `x-api-key: trk_...`.

## Core app endpoints used by frontend
- Auth: `GET /api/auth/me`, `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `PATCH /api/auth/me`, `POST /api/auth/change-password`, `DELETE /api/auth/me`
- History: `GET /api/history`, `POST /api/history`, `DELETE /api/history`, `DELETE /api/history/:id`
- Favorites: `GET /api/favorites`, `POST /api/favorites`, `DELETE /api/favorites/:id`
- Playlists/library:
  - `GET /api/playlists`, `POST /api/playlists`, `DELETE /api/playlists/:id`
  - `POST /api/playlists/:id/songs`, `PATCH /api/playlists/:id/songs`, `DELETE /api/playlists/:id/songs`
  - `POST /api/library/sync`, `GET /api/library/report`
- Search & share:
  - `GET /api/search/fuzzy?q=`
  - `POST /api/share`, `POST /api/share/song`, `POST /api/share/playlist/:playlistId`, `POST /api/share/recognition`, `GET /api/share/:shareCode`
- Recognition:
  - `POST /api/recognition/audio`
  - `POST /api/recognition/audio/live`
  - `POST /api/recognition/audio/humming`
  - `POST /api/recognition/video`
  - `POST /api/recognition/image`
- AI/assistant:
  - `POST /api/assistant`
  - `GET /api/ai/insights/weekly|monthly|trends|daily|activity`
  - `POST /api/ai/playlists/generate|update`
  - `GET /api/ai/recommendations/mood|contextual|cross-artist`
  - `GET /api/ai/discovery/daily|surprise|similar-artists`
  - `POST /api/ai/tags/suggest|apply`

## Developer API endpoints
### Session-authenticated key management
- `GET /api/developer/keys` — list API keys for current user.
- `POST /api/developer/keys` — create API key.
- `DELETE /api/developer/keys/:id` — revoke API key.

Example response for create:
```json
{
  "apiKey": "trk_...",
  "keyPrefix": "trk_abc123...",
  "label": "My App",
  "warning": "Store this key securely. It will not be shown again."
}
```

### x-api-key endpoints
- `POST /api/developer/v1/recognition/audio`
  - Content type: `multipart/form-data`
  - Required field: `audio`
  - Optional field: `mode` (`standard` | `live` | `humming`)
  - Optional header: `x-recognition-attempt-id`
- `GET /api/developer/v1/recommendations?seed=`

Example:
```bash
curl -X POST "$API/api/developer/v1/recognition/audio" \
  -H "x-api-key: trk_..." \
  -F "audio=@clip.webm" \
  -F "mode=standard"
```

## External APIs and relevant env vars
- YouTube Data API (`YOUTUBE_API_KEY`) for metadata verification.
- Recognition providers (at least one):
  - AuDD (`AUDD_API_TOKEN` or `AUDD_API_KEY`, optional `AUDD_API_URL`)
  - ACRCloud (`ACRCLOUD_ACCESS_KEY`, `ACRCLOUD_ACCESS_SECRET`, `ACRCLOUD_HOST`)
- Gemini (`GEMINI_API_KEY`, optional `GEMINI_MODEL`) for assistant and OCR-enhanced flows.
