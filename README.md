# Turrex

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
- Node.js 20+
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


## Стабилно тестване (root)

```bash
npm run test
npm run test:smoke
npm run test:backend
npm run test:frontend
npm run typecheck
```

Тестовите инструкции за Codex/CI и изолация на данни са в `docs/testing.md`.

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
cd frontend
npm install
npm run doctor:download
npm run dev
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
