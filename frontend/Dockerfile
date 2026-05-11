FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates python3 python3-venv ffmpeg \
  && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv /opt/yt-dlp \
  && /opt/yt-dlp/bin/pip install --no-cache-dir --upgrade pip yt-dlp \
  && ln -sf /opt/yt-dlp/bin/yt-dlp /usr/local/bin/yt-dlp
COPY package.json package-lock.json ./
RUN npm ci --include=dev

FROM node:22-bookworm-slim AS builder
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates python3 python3-venv ffmpeg \
  && rm -rf /var/lib/apt/lists/*
COPY --from=deps /opt/yt-dlp /opt/yt-dlp
RUN ln -sf /opt/yt-dlp/bin/yt-dlp /usr/local/bin/yt-dlp
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN yt-dlp --version
RUN ffmpeg -version
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV YTDLP_PATH=/usr/local/bin/yt-dlp
ENV FFMPEG_LOCATION=/usr/bin
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates python3 ffmpeg \
  && rm -rf /var/lib/apt/lists/*
COPY --from=deps /opt/yt-dlp /opt/yt-dlp
RUN ln -sf /opt/yt-dlp/bin/yt-dlp /usr/local/bin/yt-dlp \
  && yt-dlp --version \
  && ffmpeg -version
COPY --from=builder /app ./
EXPOSE 3000
CMD ["npm", "run", "start"]
