# Turrex

## Current Setup Quick Reference

- Use Node.js 22 and npm 10+ for both services.
- Backend env belongs in `backend/.env`: `DATABASE_URL`, `TEST_DATABASE_URL`, `JWT_SECRET`, `ALLOWED_ORIGINS`, and provider keys.
- Frontend env belongs in `frontend/.env.local` or the frontend Railway service: `NEXT_PUBLIC_API_BASE_URL` for browser calls, optional `TRACKLY_API_BASE_URL` for server-side fallback, and downloader vars such as `YTDLP_PATH`, `FFMPEG_LOCATION`, `YTDLP_CACHE_DIR`, `YTDLP_CACHE_DISABLED`, `YTDLP_TIMEOUT_MS`, `YTDLP_SLEEP_INTERVAL`, and `YTDLP_MAX_SLEEP_INTERVAL`.
- Do not use legacy `NEXT_PUBLIC_API_URL` or `TRACKLY_API_URL`; they are intentionally unsupported.
- Run `npm run doctor:download` from the repo root to check local `yt-dlp`, `ffmpeg`, `ffprobe`, temp, and cache access.
- Backend tests require a disposable Postgres database through `TEST_DATABASE_URL`; the harness refuses to use production `DATABASE_URL` during `NODE_ENV=test`.
- Theme personalization uses 10 canonical preset IDs: `stock-clean`, `ai-minimal`, `cyber-grid`, `neon-circuit`, `urban-poster`, `velvet-script`, `steel-console`, `arcade-pulse`, `noir-gothic`, and `organic-signal`.
- Public cloud YouTube downloads may fail with datacenter IP blocks even when tools are installed. For reliable exports, run locally/private network or provide direct audio files/URLs.

Turrex е уеб приложение за разпознаване на музика от **аудио** или **изображение**, което показва легални линкове за слушане и възпроизвежда YouTube съдържание чрез **видим embedded IFrame player**.

## Какво прави проектът
- Качваш аудио клип или снимка (например screenshot от плеър).
- Backend анализира входа и връща разпозната песен/песни.
- Frontend визуализира резултатите, библиотека, история и плейлисти.
- Възпроизвеждането е през YouTube embed (не чрез скрит background extractor).

## Технологии
- **Frontend:** Next.js (App Router), React 19, TypeScript, Tailwind CSS
- **Backend:** Express + TypeScript + Multer + Tesseract.js + music-metadata
- **Интеграции:** YouTube Data API, YouTube IFrame API, (опционално) AuDD / ACRCloud

## Архитектура (competition view)

```text
[Browser / Next.js Frontend]
  ├─ UI: Home, Library, Profile, Share
  ├─ Player State + Queue (React Context)
  ├─ Visible YouTube IFrame Player (BottomPlayBar)
  └─ API calls ->
        [Express Backend]
          ├─ /api/recognition/audio
          │    ├─ AuDD (if AUDD_API_KEY/AUDD_API_TOKEN)
          │    ├─ ACRCloud (if configured)
          │    └─ graceful mock fallback
          ├─ /api/recognition/image (OCR + lookup)
          └─ /api/history, /api/library, /api/share

Playback flow:
Frontend queue -> resolve videoId -> YouTube IFrame API -> visible embed player
```

## Railway deployment

### Frontend (Railway service)
- **Root Directory:** `frontend/`
- **Build Command:** `npm install && npm run build` (build lifecycle runs `prisma generate` before TypeScript compile)
- **Start Command:** `npm run start` (uses generated Prisma client; no runtime Prisma CLI invocation)

### Backend (Railway service)
- **Root Directory:** `backend/`
- **Build Command:** `npm install && npm run build` (build lifecycle runs `prisma generate` before TypeScript compile)
- **Start Command:** `npm run start` (uses generated Prisma client; no runtime Prisma CLI invocation)

## Environment variables

### Frontend (`frontend/.env.local` или Railway variables)
- `NEXT_PUBLIC_API_BASE_URL` — публичен URL към backend API
- `YOUTUBE_API_KEY` — за video resolve (ако се прави от frontend API route)

### Backend (`backend/.env` или Railway variables)
- `PORT` (по избор)
- `JWT_SECRET` (задължителен в production)
- `ADMIN_EMAIL` (email на собственика; акаунтът се bootstrap-ва автоматично с `role=admin` при register/login/auth restore)
- `GEMINI_API_KEY` (ключ за AI Assistant)
- `GEMINI_MODEL` (по избор; поддържани: `gemini-2.5-flash`, `gemini-2.0-flash`)
- `YOUTUBE_API_KEY`
- `ACRCLOUD_API_KEY` *(competition requirement; optional fallback hook)*
- `AUDD_API_KEY` или `AUDD_API_TOKEN` *(ако е наличен)
- (ако ползвате пълна ACRCloud конфигурация):
  - `ACRCLOUD_ACCESS_KEY`
  - `ACRCLOUD_ACCESS_SECRET`
  - `ACRCLOUD_HOST`

> Ако няма нито ACRCloud/AuDD ключ, backend връща graceful mock/fallback вместо hard failure.
>
> Ако AI квотата е изчерпана или доставчикът е претоварен, `/api/assistant` връща безопасен `503 AI_SERVICE_UNAVAILABLE` без crash на процеса.

## Локално пускане

### Изисквания
- Node.js 22
- npm 10+

### Инсталация (root)
```bash
npm run setup
```

### Стартиране (root)
```bash
npm run dev
```

Стартира:
- Frontend: `http://localhost:3000`
- Backend: `http://localhost:4000`

## Полезни команди (root)
- `npm run dev` — frontend + backend
- `npm run build` — build и на двата проекта
- `npm run lint` — frontend lint
- `npm run test` — тестове
- `npm run check:backend` — backend type/test checks
- `npm run doctor:download` — checks local yt-dlp, ffmpeg, ffprobe, temp, and cache access
- `npm run doctor:local` — checks backend Python deps and frontend downloader tools


## Стабилно тестване (root)

```bash
npm run test
npm run test:smoke
npm run test:backend
npm run test:frontend
npm run typecheck
```

Тестовите инструкции за Codex/CI и изолация на данни са в `docs/testing.md`.

## PostgreSQL environment setup

## Production configuration checklist

### Frontend Railway service

```env
NEXT_PUBLIC_API_BASE_URL=https://<backend-public-domain>
```

- Set this on the frontend service, not the backend service.
- It must point to the backend public domain, not the frontend domain.
- `NEXT_PUBLIC_*` values are embedded into the Next.js build, so rebuild/redeploy the frontend after changing them.
- If this value is missing outside localhost, the app now renders an actionable setup warning instead of crashing during React render.
- `/api/download` is a frontend Next.js route. Put downloader variables on the frontend service:

```env
YTDLP_PATH=/usr/local/bin/yt-dlp
FFMPEG_LOCATION=/usr/bin
```

### Backend Railway service

```env
NODE_ENV=production
PERSISTENCE_MODE=postgres
DATABASE_URL=${{Postgres.DATABASE_URL}}
JWT_SECRET=<strong-production-secret>
ALLOWED_ORIGINS=https://<frontend-domain>
CORS_ORIGINS=https://<frontend-domain>
FRONTEND_URL=https://<frontend-domain>
FRONTEND_URLS=https://<frontend-domain>
AUTH_BYPASS_EMAIL_VERIFICATION=false
```

- `DATABASE_URL=${{Postgres.DATABASE_URL}}` is Railway interpolation syntax only. Local `.env` files must use a resolved `postgresql://...` URL.
- Backend CORS origins must be explicit. Do not use wildcard origins with credentials.
- Run `npm run prisma:migrate:deploy` for the backend database before or during backend deploy.
- If `AUTH_BYPASS_EMAIL_VERIFICATION=false`, configure `MAILER_API_URL`, `MAILER_API_TOKEN`, and `MAILER_FROM`; otherwise new users cannot receive verification links.
- Safe diagnostics are available at frontend `/api/runtime-diagnostics`, frontend `/api/client-errors`, backend `/api/health`, and backend `/api/diagnostics`. They do not expose database URLs, JWT secrets, API keys, cookies, or tokens.

### Railway production backend

Set the backend Railway service variable to Railway's resolved Postgres reference:

```env
NODE_ENV=production
PERSISTENCE_MODE=postgres
DATABASE_URL=${{Postgres.DATABASE_URL}}
JWT_SECRET=<strong-production-secret>
ALLOWED_ORIGINS=https://<frontend-domain>
CORS_ORIGINS=https://<frontend-domain>
FRONTEND_URL=https://<frontend-domain>
FRONTEND_URLS=https://<frontend-domain>
AUTH_BYPASS_EMAIL_VERIFICATION=false
```

`DATABASE_URL=${{Postgres.DATABASE_URL}}` is Railway variable-reference syntax. Do not copy that syntax into local `.env` files; local Prisma needs a fully resolved `postgresql://...` URL.

Before or during deploy, run Prisma migrations for the backend database:

```bash
cd backend
npm run prisma:generate
npm run prisma:migrate:deploy
```

### Local backend development

Create `backend/.env` with a real local development database URL:

```env
NODE_ENV=development
PORT=4000
PERSISTENCE_MODE=postgres
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/ponotai_dev?schema=public
JWT_SECRET=dev-secret-change-me
AUTH_BYPASS_EMAIL_VERIFICATION=true
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
FRONTEND_URL=http://localhost:3000
FRONTEND_URLS=http://localhost:3000,http://127.0.0.1:3000
```

### Local backend tests

Create `backend/.env.test` with a separate disposable test database. The test harness refuses to fall back to production `DATABASE_URL`.

```env
NODE_ENV=test
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/ponotai_test?schema=public
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/ponotai_test?schema=public
TEST_PERSISTENCE_MODE=postgres
JWT_SECRET=test-secret
AUTH_BYPASS_EMAIL_VERIFICATION=true
```

Create the local database with Docker Compose or psql:

```bash
docker compose -f docker-compose.test.yml up -d
psql -U postgres -f scripts/create-test-db.sql
```

Then run:

```bash
cd backend
npm install
npm run prisma:generate
npm run typecheck
npm run build
npm test
npm run test:smoke
```

### GitHub Actions CI

The repository workflow starts a disposable Postgres service and sets both `DATABASE_URL` and `TEST_DATABASE_URL` to:

```env
postgresql://postgres:postgres@localhost:5432/ponotai_test?schema=public
```

## API (накратко)
- `GET /health`
- `POST /api/recognition/audio` (`multipart/form-data`, поле `audio`)
- `POST /api/recognition/image` (`multipart/form-data`, поле `image`)
- `GET /api/share/:shareCode`

## Лиценз
MIT (`LICENSE`)

## Local ZIP download/export (frontend API)

For local/private/personal usage, the Next.js frontend exposes `POST /api/download`. It runs in the frontend service, shells out to `yt-dlp` plus `ffmpeg`/`ffprobe`, and returns an MP3 for ZIP export. Direct files, blobs, and direct audio URLs remain first-class and do not depend on YouTube.

Local tool install:

- macOS: `brew install yt-dlp ffmpeg`
- Windows: `winget install yt-dlp.yt-dlp` and `winget install Gyan.FFmpeg`
- Linux: `sudo apt install ffmpeg` and `python3 -m pip install -U yt-dlp`

Local check:

```bash
npm run doctor:python --prefix backend
npm run doctor:download --prefix frontend
npm run dev:download --prefix frontend
```

Frontend service env:

- `YTDLP_PATH=/usr/local/bin/yt-dlp` for the Dockerfile deployment
- `FFMPEG_LOCATION=/usr/bin`

Railway notes:

- `/api/download` runs in the frontend Next.js service, not the backend service.
- Put `YTDLP_PATH`, `FFMPEG_LOCATION`, and other downloader env vars on the frontend Railway service.
- `frontend/Dockerfile` installs ffmpeg from apt and installs a current yt-dlp through a Python venv/pip at `/opt/yt-dlp`.
- If Railway has an old `YTDLP_PATH=/usr/bin/yt-dlp`, remove it or change it to `YTDLP_PATH=/usr/local/bin/yt-dlp`.
- Confirm the frontend service is actually using `frontend/Dockerfile`.

Optional env vars:

- `YTDLP_COOKIES` optional local path only. The app does not extract or scrape browser cookies.
- `YTDLP_CACHE_DIR` custom cache directory.
- `YTDLP_CACHE_DISABLED=true` disables the best-effort MP3 cache.
- `YTDLP_TIMEOUT_MS` clamps between 30000 and 600000.
- `NEXT_PUBLIC_YOUTUBE_BATCH_DELAY_MS` optional client batch delay, clamped from 0 to 120000.

Troubleshooting:

- Missing yt-dlp: install yt-dlp locally, or on Railway use the frontend Dockerfile and `YTDLP_PATH=/usr/local/bin/yt-dlp`.
- Old yt-dlp: update yt-dlp. YouTube extraction often breaks on old versions.
- Missing ffmpeg/ffprobe: install ffmpeg and set `FFMPEG_LOCATION=/usr/bin` in Docker/Railway.
- Cloud YouTube block, 403, 429, CAPTCHA, or bot check: YouTube may be blocking the cloud/datacenter IP. Run locally/private network, try later, update yt-dlp, or provide direct audio files/URLs.
- Timeout: retry, increase `YTDLP_TIMEOUT_MS`, update yt-dlp, or test the target directly with yt-dlp locally.
- No results: check the title/artist or provide a valid YouTube video ID/URL.

Limits:

- Hosted cloud downloads can still be blocked by YouTube/datacenter IP controls.
- The app does not bypass DRM, CAPTCHA, bot checks, paywalls, login-required videos, private videos, removed videos, age-restricted videos, or access controls.
- Reliable fallback is a local/private machine with current yt-dlp and ffmpeg, or direct audio files/URLs.
- Blocked, failed, or skipped ZIP items are written to `search-list.txt` and `failed-items.json`.
