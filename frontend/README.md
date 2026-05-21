## Frontend (Next.js)

### Run
```bash
npm run setup
npm run dev
```

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
