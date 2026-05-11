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

## Local YouTube audio download (frontend API)

For local/personal usage, the Next.js frontend exposes `POST /api/download` that shells out to your locally installed `yt-dlp` and `ffmpeg`/`ffprobe` to produce MP3 files server-side (Node runtime).

- Requires internet access and local CLI tools (`yt-dlp`, `ffmpeg`, `ffprobe`).
- Railway/Railpack deployments should include `yt-dlp` and `ffmpeg` in the runtime image and set: `RAILPACK_DEPLOY_APT_PACKAGES=yt-dlp ffmpeg`, plus `YTDLP_PATH` / `FFMPEG_LOCATION` as needed.
- Optional env vars: `YTDLP_PATH`, `YTDLP_COOKIES`, `FFMPEG_LOCATION`, `YTDLP_CACHE_DIR`, `YTDLP_CACHE_DISABLED`, `YTDLP_TIMEOUT_MS`, `NEXT_PUBLIC_YOUTUBE_BATCH_DELAY_MS`.
- Cloud/datacenter IPs may still be blocked by YouTube.
- Local/private machine execution is the most reliable YouTube fallback path.
- The app does not bypass CAPTCHA/bot checks.
- Blocked/failed YouTube items are written to `search-list.txt` and `failed-items.json` during ZIP export.

## Local downloader reliability (yt-dlp + ffmpeg)

Run locally for best results:

- macOS: `brew install yt-dlp ffmpeg`
- Windows: `winget install yt-dlp.yt-dlp` and `winget install Gyan.FFmpeg`
- Linux: `sudo apt install ffmpeg` and `python3 -m pip install -U yt-dlp`

Then:

```bash
cd frontend
npm install
npm run doctor:download
npm run dev
```

Environment variables: `YTDLP_PATH`, `FFMPEG_LOCATION`, `YTDLP_COOKIES` (optional local user path), `YTDLP_CACHE_DIR`, `YTDLP_CACHE_DISABLED`, `YTDLP_TIMEOUT_MS`, `NEXT_PUBLIC_YOUTUBE_BATCH_DELAY_MS`.

Cloud hosts (including Railway) can install binaries but still be blocked by YouTube datacenter IP controls. The app now fails fast, classifies errors, and writes unresolved items into `search-list.txt`/`failed-items.json`.
