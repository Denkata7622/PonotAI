## Frontend (Next.js)

### Run
```bash
npm run setup
npm run dev
```

### Local downloader
```bash
npm run doctor:download
npm run dev:download
```

Open:
- `http://localhost:3000/api/download/diagnostics`
- `http://localhost:3000/download`

The local downloader can polish exported tracks before they enter the ZIP:
- clean title/artist metadata and write MP3 ID3 or M4A tags
- embed imported artwork or downloader thumbnails when available
- verify processed MP3/M4A files with ffprobe
- preserve source codec/container quality where possible
- optionally normalize playlist loudness
- optionally add a conservative safety limiter
- write compact before/after audio and phone-profile metrics to `manifest.json` and `analysis/audio-comparison.json`

Export profiles:
- MP3 compatibility: default; outputs MP3 and copies source MP3 audio when possible.
- Phone optimized AAC/M4A: recommended for Samsung Music + Bluetooth earbuds; preserves AAC as M4A and keeps MP3 as MP3 to avoid unnecessary lossy MP3-to-AAC conversion.
- Phone optimized AAC/M4A + normalized volume: outputs AAC/M4A and re-encodes because loudness filtering is required.
- MP3 + normalized volume: keeps MP3 compatibility while normalizing loudness.

The comparison metrics are technical: re-encoding avoided, generation-loss risk, Samsung Music/Bluetooth friendliness, loudness target closeness, peak/clipping risk, duration preservation, codec/readability, and warnings. "Improved" means improved volume consistency or preservation for this profile, not guaranteed subjective quality. No EQ, bass boost, treble boost, vocal clarity filter, fake remastering, or source-quality restoration is applied.

Phone optimized exports may contain mixed `.m4a` and `.mp3` tracks. That is intentional: AAC/M4A can be the cleaner practical export for Samsung Music and AAC Bluetooth earbuds when the source is already AAC, while MP3 is kept as MP3 to avoid another lossy generation.

Troubleshooting:
- Windows ffmpeg path: `$env:FFMPEG_LOCATION = "C:\tools\ffmpeg\bin"`
- Run `npm run test:audio-polish` to generate synthetic tones, normalize them, compare before/after loudness, and clean the temp files.
- Run `npm run test:phone-profile` to generate synthetic AAC/M4A, MP3, and Opus/WebM fixtures, verify phone-profile codec decisions, M4A tags, embedded cover art, and no EQ filters.
- Missing tags or covers: check `/api/download/diagnostics` for ffmpeg/ffprobe and inspect the ZIP manifest warnings.
- Slow exports: disable Normalize volume.
- Hosted Railway may still be blocked by YouTube datacenter/IP controls; use local/private network or direct audio files for reliable fallback.
- CAPTCHA, login-required, private, age-restricted, removed, DRM, and paywalled videos are not bypassed.

### API connection
The client calls the backend API through the centralized API config helpers.
Render paths use safe status helpers; API/event paths use strict helpers.

Set backend URL in `.env.local`:
```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
```

On Railway, set `NEXT_PUBLIC_API_BASE_URL=https://trackly-production-6ec0.up.railway.app` on the frontend service and rebuild/redeploy the frontend. `NEXT_PUBLIC_*` values are baked into the browser bundle at build time. Server routes may also read `TRACKLY_API_BASE_URL` at runtime, but client recognition, personalization, and recommendations need the public build variable.

The backend API URL must include `https://`. Values like `trackly-production-6ec0.up.railway.app` are invalid and the UI reports that exact fix. If backend config is missing, backend-powered actions show a setup warning, while Local ZIP Export still allows attached files, direct audio URLs, and frontend `/api/download` YouTube fallback.

Safe runtime checks:
- `GET /api/runtime-diagnostics`
- `GET /api/runtime-config`
- `POST /api/client-errors`

`/api/download` runs in this frontend service. Put `YTDLP_PATH` and `FFMPEG_LOCATION` on the frontend service, not the backend service.

Downloader runtime notes:
- Local Windows: `winget install yt-dlp.yt-dlp` and `winget install Gyan.FFmpeg`
- Local macOS: `brew install yt-dlp ffmpeg`
- Local Linux: `python3 -m pip install -U yt-dlp` and `sudo apt install ffmpeg`
- Railway frontend Dockerfile: `YTDLP_PATH=/usr/local/bin/yt-dlp`, `FFMPEG_LOCATION=/usr/bin`
- Backend Python packages do not change `/api/download`; the frontend Dockerfile/runtime does.
- Cloud/datacenter IPs may still be blocked by YouTube even when yt-dlp works. Local/private network is the most reliable YouTube fallback.
- If Turbopack crashes on Windows during local development, clear `.next` and retry. As a temporary local-only fallback use `next dev --webpack`; production builds still use `next build`.

### Feature structure
- `features/recognition/api.ts` - API client for recognition.
- `features/tracks/types.ts` - shared track types.
- `features/tracks/seed.ts` - fallback/seed recent tracks.
- `components/TrackCard.tsx` - reusable track card UI.


### Run backend + frontend together
From repo root:
```bash
npm run setup
npm run dev
```


### Remove old `.next` build cache
From repo root:
```bash
npm run clean
npm run setup
```

### PWA icon requirement
Place `frontend/public/icon-192.svg` and `frontend/public/icon-512.svg` before deployment so `/manifest.json` resolves its icons.
