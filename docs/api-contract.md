# API Contract

## Health
### GET /health
Returns backend health status.

**Response**
```json
{ "ok": true }
```

## Recognition
### POST /api/recognition/audio
Recognizes a song from an uploaded audio clip (`multipart/form-data`, field: `audio`).

**Success response**
```json
{
  "songName": "Blinding Lights",
  "artist": "The Weeknd",
  "album": "After Hours",
  "genre": "Pop",
  "platformLinks": {
    "youtube": "https://www.youtube.com/watch?v=4NRXx6U8ABQ",
    "appleMusic": "https://music.apple.com/...",
    "spotify": "https://open.spotify.com/...",
    "preview": "https://..."
  },
  "youtubeVideoId": "4NRXx6U8ABQ",
  "releaseYear": 2020,
  "source": "provider",
  "verificationStatus": "verified"
}
```

**Verification failure**
- Status: `404`
```json
{
  "message": "Recognition succeeded but no verified YouTube result was found.",
  "code": "NO_VERIFIED_RESULT"
}
```

### POST /api/recognition/image
Recognizes a song candidate from uploaded image text (`multipart/form-data`, field: `image`) and verifies it on YouTube.

Response shape is the same as `/api/recognition/audio`.

## 2026-04 Expansion Endpoints

- `POST /api/share/playlist/:playlistId` → create public playlist share link.
- `POST /api/share/recognition` → create public recognition-result share link.
- `GET /api/share/:shareCode` → returns `type: song | recognition | playlist` with sanitized public payload.
- `POST /api/recognition/audio/live` → live recording recognition path.
- `POST /api/recognition/audio/humming` → experimental humming/singing recognition path.
- `POST /api/recognition/video` → video upload recognition path (audio extraction workflow).
- `GET /api/achievements` → server-tracked achievements list.
- `GET /api/search/fuzzy?q=` → typo-tolerant internal search.
- `GET /api/library/report` → versioned listening report export.
- `GET/POST/DELETE /api/developer/keys...` → API key management.
- `POST /api/developer/v1/recognition/audio` + `GET /api/developer/v1/recommendations` with `x-api-key`.
- `GET /api/admin/overview`, `POST /api/admin/demo-account` (admin only).
