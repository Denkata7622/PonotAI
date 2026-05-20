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

On Railway, set `NEXT_PUBLIC_API_BASE_URL=https://<backend-public-domain>` on the frontend service and redeploy the frontend. If it is missing outside localhost, backend-required actions show a setup warning instead of crashing React render.

Safe runtime checks:
- `GET /api/runtime-diagnostics`
- `POST /api/client-errors`

`/api/download` runs in this frontend service. Put `YTDLP_PATH` and `FFMPEG_LOCATION` on the frontend service, not the backend service.

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
