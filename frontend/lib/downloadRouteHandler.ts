import { promises as fs } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

const YOUTUBE_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;
const MIN_TIMEOUT_MS = 30000;
const DEFAULT_TIMEOUT_MS = 180000;
const MAX_TIMEOUT_MS = 600000;
const CAPTURE_LIMIT = 16384;
const CLIENT_DETAIL_LIMIT = 900;

type DownloadBody = {
  youtubeId?: string;
  youtubeUrl?: string;
  query?: string;
  title?: string;
  artist?: string;
  platformLinks?: Record<string, unknown>;
};

type DownloadConfig = {
  ytdlpPath: string;
  ffmpegLocation?: string;
  timeoutMs: number;
  cookiesConfigured: boolean;
  cacheDisabled: boolean;
  cacheDir: string;
};

type DownloadTarget = {
  target: string;
  type: "id" | "url" | "query";
};

type ClassifiedDownloadError = {
  code: string;
  status: number;
  detail: string;
  fix: string;
  retryable: boolean;
  globalFailure: boolean;
};

type DownloadErrorPayload = {
  error: string;
  code: string;
  detail: string;
  fix: string;
  retryable: boolean;
  globalFailure: boolean;
  safeDiagnosticsHint: string;
  requestId: string;
};

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : fallback));
}

function clampTimeoutMs(value: string | undefined): number {
  return clampNumber(Number(value || DEFAULT_TIMEOUT_MS), MIN_TIMEOUT_MS, MAX_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
}

function sanitizeFileName(input: string): string {
  return (input || "track")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "")
    .slice(0, 120) || "track";
}

function contentDisposition(filename: string): string {
  const safe = sanitizeFileName(filename);
  const asciiFallback = safe.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_") || "track.mp3";
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

function capOutput(current: string, next: string): string {
  return (current + next).slice(-CAPTURE_LIMIT);
}

function redactConfiguredPaths(message: string): string {
  let redacted = message;
  for (const value of [process.env.YTDLP_COOKIES, process.env.YTDLP_PATH].filter((entry): entry is string => Boolean(entry))) {
    redacted = redacted.split(value).join("[redacted]");
  }
  return redacted;
}

function compactDetail(message: string | undefined): string {
  const value = redactConfiguredPaths(message || "unknown error")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
  return (value || "unknown error").slice(0, CLIENT_DETAIL_LIMIT);
}

function normalizeForClassification(message: string, error?: unknown): string {
  const errorMessage = error instanceof Error ? `${error.name} ${error.message}` : "";
  return `${message}\n${errorMessage}`
    .replace(/\u2019/g, "'")
    .replace(/\u2018/g, "'")
    .toLowerCase();
}

function classifyDownloadError(fullDetail: string, error?: unknown): ClassifiedDownloadError {
  const raw = normalizeForClassification(fullDetail, error);
  const detail = compactDetail(fullDetail || (error instanceof Error ? error.message : String(error || "")));

  if (raw.includes("enoent") || raw.includes("spawn yt-dlp enoent") || raw.includes("command not found")) {
    return {
      code: "missing-binary",
      status: 503,
      detail,
      fix: "Install yt-dlp in the runtime image. On Railway frontend service, use frontend/Dockerfile or set YTDLP_PATH correctly.",
      retryable: false,
      globalFailure: true,
    };
  }

  if (raw.includes("eacces") || raw.includes("permission denied")) {
    return {
      code: "binary-permission",
      status: 500,
      detail,
      fix: "Make the yt-dlp binary executable or set YTDLP_PATH to an executable binary.",
      retryable: false,
      globalFailure: true,
    };
  }

  if (raw.includes("ffmpeg not found")
    || raw.includes("ffprobe not found")
    || raw.includes("ffmpeg/ffprobe")
    || (raw.includes("postprocessing") && raw.includes("ffmpeg"))) {
    return {
      code: "ffmpeg-missing",
      status: 503,
      detail,
      fix: "Install ffmpeg/ffprobe and restart the server, or set FFMPEG_LOCATION.",
      retryable: false,
      globalFailure: true,
    };
  }

  if (["age restricted", "login required", "private video", "members-only", "members only"].some((needle) => raw.includes(needle))) {
    return {
      code: "age-or-login-required",
      status: 403,
      detail,
      fix: "This video requires sign-in or access. The app will not bypass access controls. Use content you can access and are allowed to download.",
      retryable: false,
      globalFailure: false,
    };
  }

  if (["sign in to confirm", "confirm you're not a bot", "captcha", "bot", "blocked", "too many requests", "rate limit", "rate-limit", "429", "http error 403", "forbidden", "unusual traffic"].some((needle) => raw.includes(needle))) {
    return {
      code: "youtube-blocked",
      status: 429,
      detail,
      fix: "YouTube blocked this server environment. Run locally/private network, try later, update yt-dlp, or provide direct audio files.",
      retryable: true,
      globalFailure: true,
    };
  }

  if (["video unavailable", "no video results", "unable to find video", "this video is unavailable"].some((needle) => raw.includes(needle))) {
    return {
      code: "not-found",
      status: 404,
      detail,
      fix: "Check the title/artist or provide a direct valid YouTube video ID/URL.",
      retryable: false,
      globalFailure: false,
    };
  }

  if (["enotfound", "econnreset", "etimedout", "eai_again", "network unreachable"].some((needle) => raw.includes(needle))) {
    return {
      code: "network",
      status: 503,
      detail,
      fix: "Check internet connection/DNS/firewall and retry.",
      retryable: true,
      globalFailure: false,
    };
  }

  if (raw.includes("timed out") || raw.includes("timeout")) {
    return {
      code: "timeout",
      status: 504,
      detail,
      fix: "Retry, increase YTDLP_TIMEOUT_MS, update yt-dlp, or test the song directly with yt-dlp locally.",
      retryable: true,
      globalFailure: false,
    };
  }

  if (raw.includes("without producing an mp3") || raw.includes("empty output") || raw.includes("no mp3 produced")) {
    return {
      code: "empty-output",
      status: 502,
      detail,
      fix: "Check ffmpeg, update yt-dlp, and try a different target.",
      retryable: true,
      globalFailure: false,
    };
  }

  return {
    code: "download-failed",
    status: 503,
    detail,
    fix: "Update yt-dlp, verify ffmpeg, try direct URL/ID, or run the command locally for details.",
    retryable: true,
    globalFailure: false,
  };
}

function resolveDownloaderConfig(): DownloadConfig {
  return {
    ytdlpPath: process.env.YTDLP_PATH || "yt-dlp",
    ffmpegLocation: process.env.FFMPEG_LOCATION,
    timeoutMs: clampTimeoutMs(process.env.YTDLP_TIMEOUT_MS),
    cookiesConfigured: Boolean(process.env.YTDLP_COOKIES),
    cacheDisabled: process.env.YTDLP_CACHE_DISABLED === "true",
    cacheDir: process.env.YTDLP_CACHE_DIR || path.join(tmpdir(), "ponotai-ytdlp-cache"),
  };
}

function positiveEnvNumber(name: string): string | undefined {
  const value = Number(process.env[name] || 0);
  return Number.isFinite(value) && value > 0 ? String(value) : undefined;
}

function buildYtdlpArgs(target: string, outputTemplate: string): string[] {
  const cfg = resolveDownloaderConfig();
  const args = [
    "--no-playlist",
    "--no-progress",
    "-f",
    "bestaudio/best",
    "-x",
    "--audio-format",
    "mp3",
    "--audio-quality",
    "0",
    "-o",
    outputTemplate,
    "--retries",
    "3",
    "--fragment-retries",
    "3",
    "--retry-sleep",
    "http:exp=3:30",
    "--retry-sleep",
    "fragment:exp=3:30",
    "--sleep-requests",
    "1",
  ];

  const sleepInterval = positiveEnvNumber("YTDLP_SLEEP_INTERVAL");
  const maxSleepInterval = positiveEnvNumber("YTDLP_MAX_SLEEP_INTERVAL");
  if (sleepInterval) args.push("--sleep-interval", sleepInterval);
  if (maxSleepInterval) args.push("--max-sleep-interval", maxSleepInterval);
  if (cfg.cacheDisabled) args.push("--no-cache-dir");
  else if (process.env.YTDLP_CACHE_DIR) args.push("--cache-dir", cfg.cacheDir);
  if (cfg.cookiesConfigured) args.push("--cookies", process.env.YTDLP_COOKIES as string);
  if (cfg.ffmpegLocation) args.push("--ffmpeg-location", cfg.ffmpegLocation);
  args.push(target);
  return args;
}

function cachePaths(target: string): { dir: string; mp3Path: string; metaPath: string } {
  const dir = resolveDownloaderConfig().cacheDir;
  const key = createHash("sha256").update(target).digest("hex");
  return { dir, mp3Path: path.join(dir, `${key}.mp3`), metaPath: path.join(dir, `${key}.json`) };
}

async function readCachedMp3(target: string): Promise<{ audio: Buffer; filename: string } | undefined> {
  if (resolveDownloaderConfig().cacheDisabled) return undefined;
  try {
    const { mp3Path, metaPath } = cachePaths(target);
    const stat = await fs.stat(mp3Path);
    if (!stat.isFile() || stat.size <= 0) return undefined;
    const audio = await fs.readFile(mp3Path);
    let filename = "cached.mp3";
    try {
      const meta = JSON.parse(await fs.readFile(metaPath, "utf8")) as { filename?: string };
      filename = sanitizeFileName(meta.filename || filename);
    } catch {
      filename = "cached.mp3";
    }
    return { audio, filename };
  } catch {
    return undefined;
  }
}

async function writeCachedMp3(target: string, audio: Buffer, filename: string, targetType: DownloadTarget["type"]): Promise<void> {
  if (resolveDownloaderConfig().cacheDisabled || audio.byteLength <= 0) return;
  try {
    const { dir, mp3Path, metaPath } = cachePaths(target);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(mp3Path, audio);
    await fs.writeFile(metaPath, JSON.stringify({
      targetType,
      createdAt: new Date().toISOString(),
      filename: sanitizeFileName(filename),
      source: "yt-dlp",
    }), "utf8");
  } catch {
    // Cache is best effort only.
  }
}

function isFakeYoutubeId(id: string): boolean {
  return id.startsWith("import-")
    || id.startsWith("local-")
    || id === "index-only"
    || /^\d+$/.test(id);
}

type YoutubeUrlParseResult =
  | { ok: true; url: string; id: string }
  | { ok: false; reason: "empty" | "invalid-url" | "unsupported-host" | "invalid-id" };

function parseYoutubeUrl(input?: string): YoutubeUrlParseResult {
  if (!input || !input.trim()) return { ok: false, reason: "empty" };
  try {
    const url = new URL(input.trim());
    const host = url.hostname.toLowerCase();
    const isYoutubeHost = host === "youtube.com" || host.endsWith(".youtube.com");
    if (isYoutubeHost && url.pathname === "/watch") {
      const id = url.searchParams.get("v")?.trim() || "";
      return YOUTUBE_ID_REGEX.test(id) && !isFakeYoutubeId(id)
        ? { ok: true, id, url: `https://www.youtube.com/watch?v=${id}` }
        : { ok: false, reason: "invalid-id" };
    }
    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0] || "";
      return YOUTUBE_ID_REGEX.test(id) && !isFakeYoutubeId(id)
        ? { ok: true, id, url: `https://www.youtube.com/watch?v=${id}` }
        : { ok: false, reason: "invalid-id" };
    }
    if (isYoutubeHost || host === "music.youtube.com") return { ok: false, reason: "invalid-url" };
    return { ok: false, reason: "unsupported-host" };
  } catch {
    return { ok: false, reason: "invalid-url" };
  }
}

function sanitizeSearchQuery(query: string): string {
  return query.replace(/[\u0000-\u001F]/g, " ").replace(/\s+/g, " ").trim().slice(0, 180);
}

function requestId(): string {
  return randomUUID().replace(/-/g, "").slice(0, 12);
}

function jsonError(error: string, code: string, fix: string, status: number, id: string, extra?: Partial<DownloadErrorPayload>): NextResponse {
  return NextResponse.json({
    error,
    code,
    detail: extra?.detail ?? error,
    fix,
    retryable: extra?.retryable ?? false,
    globalFailure: extra?.globalFailure ?? false,
    safeDiagnosticsHint: extra?.safeDiagnosticsHint ?? `Use request ID ${id} with /api/download/diagnostics. Do not share secrets or cookie paths.`,
    requestId: id,
  }, {
    status,
    headers: { "X-PonotAI-Request-ID": id },
  });
}

function invalidYoutubeUrlResponse(id: string): NextResponse {
  return jsonError(
    "Invalid YouTube URL",
    "invalid-youtube-url",
    "Provide a real youtube.com/watch?v=..., music.youtube.com/watch?v=..., or youtu.be/... URL. Other hosts are not accepted by /api/download.",
    400,
    id,
  );
}

function resolveDownloadTarget(body: DownloadBody, id: string): { target?: DownloadTarget; response?: NextResponse } {
  const youtubeId = body.youtubeId?.trim();
  if (youtubeId) {
    if (!YOUTUBE_ID_REGEX.test(youtubeId) || isFakeYoutubeId(youtubeId)) {
      return {
        response: jsonError(
          "Invalid youtubeId",
          "invalid-youtube-id",
          "Only pass real 11-character YouTube video IDs. Do not pass local/import IDs.",
          400,
          id,
        ),
      };
    }
    return { target: { target: `https://www.youtube.com/watch?v=${youtubeId}`, type: "id" } };
  }

  if (typeof body.youtubeUrl === "string" && body.youtubeUrl.trim()) {
    const parsedUrl = parseYoutubeUrl(body.youtubeUrl);
    if (!parsedUrl.ok) return { response: invalidYoutubeUrlResponse(id) };
    return { target: { target: parsedUrl.url, type: "url" } };
  }

  const platformYoutube = [body.platformLinks?.youtube, body.platformLinks?.youtubeMusic]
    .find((value) => typeof value === "string" && value.trim()) as string | undefined;
  const parsedPlatformUrl = parseYoutubeUrl(platformYoutube);
  if (parsedPlatformUrl.ok) return { target: { target: parsedPlatformUrl.url, type: "url" } };
  if (platformYoutube && parsedPlatformUrl.reason !== "empty") return { response: invalidYoutubeUrlResponse(id) };

  const query = sanitizeSearchQuery(body.query?.trim() || [body.artist?.trim(), body.title?.trim()].filter(Boolean).join(" - "));
  if (query) return { target: { target: `ytsearch1:${query}`, type: "query" } };

  return {
    response: jsonError(
      "youtubeId or query is required",
      "missing-input",
      "Provide a YouTube video ID, YouTube URL, or search query.",
      400,
      id,
    ),
  };
}

function downloadHeaders(audioLength: number, filename: string, cache: "hit" | "miss", targetType: DownloadTarget["type"], id: string): HeadersInit {
  return {
    "Content-Type": "audio/mpeg",
    "Content-Length": String(audioLength),
    "Content-Disposition": contentDisposition(filename),
    "Cache-Control": "no-store",
    "X-PonotAI-Download-Cache": cache,
    "X-PonotAI-Download-Target-Type": targetType,
    "X-PonotAI-Request-ID": id,
  };
}

function logDownload(event: "download.request" | "download.success" | "download.failure", payload: Record<string, unknown>): void {
  if (process.env.NODE_ENV === "production") return;
  const safePayload = { ...payload };
  delete safePayload.args;
  console.info(JSON.stringify({ event, ...safePayload }));
}

export type YtdlpRunner = (
  args: string[],
  options: { cwd: string; timeoutMs: number; bin: string },
) => Promise<{ code: number; stdout: string; stderr: string }>;

const defaultRunner: YtdlpRunner = (args, options) => new Promise((resolve, reject) => {
  let settled = false;
  let stdout = "";
  let stderr = "";
  let didTimeout = false;
  let timer: ReturnType<typeof setTimeout>;

  const finish = (fn: () => void) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    fn();
  };

  const child = spawn(options.bin, args, {
    cwd: options.cwd,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });

  timer = setTimeout(() => {
    didTimeout = true;
    child.kill("SIGTERM");
  }, options.timeoutMs);

  child.stdout.on("data", (chunk: Buffer) => {
    stdout = capOutput(stdout, chunk.toString("utf8"));
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderr = capOutput(stderr, chunk.toString("utf8"));
  });
  child.on("error", (error) => {
    finish(() => reject(error));
  });
  child.on("close", (code) => {
    finish(() => resolve({
      code: didTimeout ? 124 : (code ?? 1),
      stdout,
      stderr: didTimeout ? capOutput(stderr, `\nyt-dlp timed out after ${options.timeoutMs}ms`) : stderr,
    }));
  });
});

export async function handleDownloadPost(request: Request, runner: YtdlpRunner = defaultRunner): Promise<Response> {
  const id = requestId();
  let body: DownloadBody;
  try {
    const text = await request.text();
    if (!text.trim()) {
      return jsonError("youtubeId, youtubeUrl, query, or title/artist is required", "missing-input", "Send a JSON body with youtubeId, youtubeUrl, query, or title/artist.", 400, id);
    }
    const parsed = JSON.parse(text) as unknown;
    body = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as DownloadBody : {};
  } catch {
    return jsonError("Invalid JSON body", "invalid-json", "Send valid JSON with youtubeId, youtubeUrl, query, or title/artist.", 400, id);
  }

  const resolved = resolveDownloadTarget(body || {}, id);
  if (resolved.response) return resolved.response;
  const target = resolved.target as DownloadTarget;
  logDownload("download.request", { requestId: id, targetType: target.type, cacheDisabled: resolveDownloaderConfig().cacheDisabled });

  let tempDir = "";
  try {
    const cached = await readCachedMp3(target.target);
    if (cached) {
      logDownload("download.success", { requestId: id, targetType: target.type, cache: "hit", bytes: cached.audio.byteLength });
      return new Response(new Uint8Array(cached.audio), {
        status: 200,
        headers: downloadHeaders(cached.audio.byteLength, cached.filename, "hit", target.type, id),
      });
    }

    tempDir = await fs.mkdtemp(path.join(tmpdir(), "ponotai-ytdlp-"));
    const cfg = resolveDownloaderConfig();
    const outputTemplate = path.join(tempDir, "%(title).200B.%(ext)s");
    const result = await runner(buildYtdlpArgs(target.target, outputTemplate), {
      cwd: tempDir,
      timeoutMs: cfg.timeoutMs,
      bin: cfg.ytdlpPath,
    });

    if (result.code !== 0) {
      const fullDetail = `${result.stderr || ""}\n${result.stdout || ""}`.trim() || (result.code === 124 ? "yt-dlp timed out" : `yt-dlp exited with code ${result.code}`);
      const classified = classifyDownloadError(fullDetail);
      logDownload("download.failure", { requestId: id, targetType: target.type, code: classified.code, status: classified.status });
      return jsonError("YouTube download failed.", classified.code, classified.fix, classified.status, id, classified);
    }

    const mp3 = (await fs.readdir(tempDir)).find((entry) => entry.toLowerCase().endsWith(".mp3"));
    if (!mp3) {
      const classified = classifyDownloadError("yt-dlp completed without producing an mp3 file");
      logDownload("download.failure", { requestId: id, targetType: target.type, code: classified.code, status: classified.status });
      return jsonError("YouTube download failed.", classified.code, classified.fix, classified.status, id, classified);
    }

    const audio = await fs.readFile(path.join(tempDir, mp3));
    if (audio.byteLength <= 0) {
      const classified = classifyDownloadError("yt-dlp produced an empty output file");
      logDownload("download.failure", { requestId: id, targetType: target.type, code: classified.code, status: classified.status });
      return jsonError("YouTube download failed.", classified.code, classified.fix, classified.status, id, classified);
    }

    await writeCachedMp3(target.target, audio, mp3, target.type);
    logDownload("download.success", { requestId: id, targetType: target.type, cache: "miss", bytes: audio.byteLength });
    return new Response(new Uint8Array(audio), {
      status: 200,
      headers: downloadHeaders(audio.byteLength, mp3, "miss", target.type, id),
    });
  } catch (error) {
    const fullDetail = error instanceof Error ? error.message : String(error);
    const classified = classifyDownloadError(fullDetail, error);
    logDownload("download.failure", { requestId: id, targetType: target.type, code: classified.code, status: classified.status });
    return jsonError("YouTube download failed.", classified.code, classified.fix, classified.status, id, classified);
  } finally {
    if (tempDir) await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
