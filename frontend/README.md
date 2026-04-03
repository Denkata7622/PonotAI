## Frontend (Next.js)

### Run
```bash
npm run setup
npm run dev
```

### API connection
The client calls `/api/recognize` (same-origin Next route).

Set backend URL in `.env.local`:
```bash
NEXT_PUBLIC_API_URL=http://localhost:4000
```

Set `NEXT_PUBLIC_API_URL` to point at the backend API.

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
