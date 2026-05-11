import { promises as fs } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const YOUTUBE_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;
const DEFAULT_TIMEOUT_MS = Number(process.env.YTDLP_TIMEOUT_MS || 180000);
const MAX_TIMEOUT_MS = 600000;
const STDERR_LIMIT = 16384;

function clampTimeoutMs(v: number): number { return Math.min(MAX_TIMEOUT_MS, Math.max(30000, Number.isFinite(v) ? v : 180000)); }
function sanitizeFileName(input: string): string { return (input || "track").replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ").replace(/\s+/g, " ").trim().replace(/[. ]+$/g, "").slice(0, 120) || "track"; }
function contentDisposition(filename: string): string { const safe = sanitizeFileName(filename); return `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(safe)}`; }
function firstUsefulDetail(message?: string): string { return ((message || "").split("\n").map((s) => s.trim()).find(Boolean) || "unknown error").slice(0, 500); }

function classifyDownloadError(detail: string, error?: unknown): { code: string; status: number; detail: string; fix: string } {
  const raw = `${detail} ${(error instanceof Error ? error.message : "")}`.toLowerCase();
  if (raw.includes("enoent") || raw.includes("spawn yt-dlp") || raw.includes("command not found")) return { code: "missing-binary", status: 500, detail: "yt-dlp is not installed or not available in PATH.", fix: "Install yt-dlp on the machine running Next.js or set YTDLP_PATH." };
  if (raw.includes("eacces") || raw.includes("permission denied")) return { code: "binary-permission", status: 500, detail, fix: "Make the yt-dlp binary executable or set YTDLP_PATH to an executable binary." };
  if (raw.includes("ffmpeg not found") || raw.includes("ffprobe not found") || (raw.includes("postprocessing") && raw.includes("ffmpeg"))) return { code: "ffmpeg-missing", status: 500, detail, fix: "Install ffmpeg/ffprobe and restart the server, or set FFMPEG_LOCATION." };
  if (["sign in to confirm", "confirm you're not a bot", "confirm you’re not a bot", "captcha", "bot", "blocked", "too many requests", "rate limit", "rate-limit", "429", "http error 403", "forbidden", "unusual traffic"].some((s) => raw.includes(s))) return { code: "youtube-blocked", status: 429, detail, fix: "YouTube blocked this server environment. Run locally/private network, try later, update yt-dlp, or provide direct audio files." };
  if (["age restricted", "login required", "private video", "members-only"].some((s) => raw.includes(s))) return { code: "age-or-login-required", status: 403, detail, fix: "This video requires sign-in or access. The app will not bypass access controls. Use content you can access and are allowed to download." };
  if (["video unavailable", "no video results", "unable to find video", "this video is unavailable"].some((s) => raw.includes(s))) return { code: "not-found", status: 404, detail, fix: "Check the title/artist or provide a direct valid YouTube video ID/URL." };
  if (["enotfound", "econnreset", "etimedout", "eai_again", "network unreachable"].some((s) => raw.includes(s))) return { code: "network", status: 503, detail, fix: "Check internet connection/DNS/firewall and retry." };
  if (raw.includes("timed out")) return { code: "timeout", status: 504, detail, fix: "Try again, update yt-dlp, increase YTDLP_TIMEOUT_MS, or test the song directly with yt-dlp locally." };
  if (raw.includes("without producing an mp3") || raw.includes("empty output")) return { code: "empty-output", status: 502, detail, fix: "Check ffmpeg, update yt-dlp, and try a different target." };
  return { code: "download-failed", status: 503, detail, fix: "Update yt-dlp, verify ffmpeg, try direct URL/ID, or run the command locally for details." };
}

function resolveDownloaderConfig() {
  return { ytdlpPath: process.env.YTDLP_PATH || "yt-dlp", ffmpegLocation: process.env.FFMPEG_LOCATION, timeoutMs: clampTimeoutMs(DEFAULT_TIMEOUT_MS), cookiesConfigured: Boolean(process.env.YTDLP_COOKIES), cacheDisabled: process.env.YTDLP_CACHE_DISABLED === "true", cacheDir: process.env.YTDLP_CACHE_DIR || path.join(tmpdir(), "ponotai-ytdlp-cache") };
}
function buildYtdlpArgs(target: string, outputTemplate: string): string[] {
  const cfg = resolveDownloaderConfig();
  const args = ["--no-playlist", "--no-progress", "-f", "bestaudio/best", "-x", "--audio-format", "mp3", "--audio-quality", "0", "--retries", "3", "--fragment-retries", "3", "--retry-sleep", "http:exp=3:30", "--retry-sleep", "fragment:exp=3:30", "--sleep-requests", "1", "-o", outputTemplate];
  const sleepInterval = Number(process.env.YTDLP_SLEEP_INTERVAL || 0);
  const maxSleep = Number(process.env.YTDLP_MAX_SLEEP_INTERVAL || 0);
  if (sleepInterval > 0) args.push("--sleep-interval", String(sleepInterval));
  if (maxSleep > 0) args.push("--max-sleep-interval", String(maxSleep));
  if (cfg.cookiesConfigured) args.push("--cookies", process.env.YTDLP_COOKIES as string);
  if (cfg.ffmpegLocation) args.push("--ffmpeg-location", cfg.ffmpegLocation);
  args.push(target);
  return args;
}
function getCachePaths(target: string) { const dir = resolveDownloaderConfig().cacheDir; const key = createHash("sha256").update(target).digest("hex"); return { dir, mp3Path: path.join(dir, `${key}.mp3`), metaPath: path.join(dir, `${key}.json`) }; }
async function readCachedMp3(target: string): Promise<{ audio: Buffer; filename: string } | undefined> { if (resolveDownloaderConfig().cacheDisabled) return undefined; try { const { mp3Path, metaPath } = getCachePaths(target); const audio = await fs.readFile(mp3Path); const meta = JSON.parse(await fs.readFile(metaPath, "utf8")) as { filename?: string }; return { audio, filename: sanitizeFileName(meta.filename || "cached.mp3") }; } catch { return undefined; } }
async function writeCachedMp3(target: string, audio: Buffer, filename: string): Promise<void> { if (resolveDownloaderConfig().cacheDisabled) return; try { const { dir, mp3Path, metaPath } = getCachePaths(target); await fs.mkdir(dir, { recursive: true }); await fs.writeFile(mp3Path, audio); await fs.writeFile(metaPath, JSON.stringify({ targetType: target.startsWith("ytsearch1:") ? "query" : target.startsWith("http") ? "url" : "id", createdAt: new Date().toISOString(), filename, source: "yt-dlp" }), "utf8"); } catch {} }

export type YtdlpRunner = (args: string[], options: { cwd: string; timeoutMs: number; bin: string }) => Promise<{ code: number; stdout: string; stderr: string }>;
const defaultRunner: YtdlpRunner = (args, options) => new Promise((resolve, reject) => {
  const child = spawn(options.bin, args, { cwd: options.cwd, stdio: ["ignore", "pipe", "pipe"], shell: false });
  let stdout = ""; let stderr = ""; let didTimeout = false;
  const push = (curr: string, next: string) => (curr + next).slice(-STDERR_LIMIT);
  child.stdout.on("data", (c: Buffer) => { stdout = push(stdout, c.toString("utf8")); });
  child.stderr.on("data", (c: Buffer) => { stderr = push(stderr, c.toString("utf8")); });
  const timer = setTimeout(() => { didTimeout = true; child.kill("SIGTERM"); }, options.timeoutMs);
  child.on("error", (e) => { clearTimeout(timer); reject(e); });
  child.on("close", (code) => { clearTimeout(timer); resolve({ code: didTimeout ? 124 : (code ?? 1), stdout, stderr: didTimeout ? `yt-dlp timed out after ${options.timeoutMs}ms` : stderr }); });
});

function youtubeUrlFromAny(input?: string): string | undefined { if (!input) return undefined; try { const u = new URL(input); const host = u.hostname.toLowerCase(); const isYoutubeHost = host === "youtube.com" || host.endsWith(".youtube.com"); if (isYoutubeHost && u.pathname === "/watch") return u.toString(); if (host === "youtu.be" && u.pathname.length > 1) return `https://www.youtube.com/watch?v=${u.pathname.slice(1)}`; } catch {} return undefined; }

export async function handleDownloadPost(request: Request, runner: YtdlpRunner = defaultRunner): Promise<Response> {
  let body: { youtubeId?: string; query?: string; title?: string; artist?: string; youtubeUrl?: string; platformLinks?: Record<string, unknown> };
  try { body = await request.json() as typeof body; } catch { return NextResponse.json({ error: "Invalid JSON body", code: "invalid-json", fix: "Send valid JSON with youtubeId or query." }, { status: 400 }); }

  let tempDir = "";
  try {
    const youtubeId = body.youtubeId?.trim();
    if (youtubeId && (!YOUTUBE_ID_REGEX.test(youtubeId) || youtubeId.startsWith("import-") || youtubeId.startsWith("local-") || youtubeId === "index-only")) {
      return NextResponse.json({ error: "Invalid youtubeId", code: "invalid-youtube-id", fix: "Only pass real 11-character YouTube video IDs. Do not pass local/import IDs." }, { status: 400 });
    }
    const platformYoutube = typeof body.platformLinks?.youtube === "string" ? body.platformLinks.youtube : undefined;
    const url = youtubeUrlFromAny(body.youtubeUrl) || youtubeUrlFromAny(platformYoutube);
    const query = body.query?.trim() || [body.artist?.trim(), body.title?.trim()].filter(Boolean).join(" - ");
    const target = youtubeId ? `https://www.youtube.com/watch?v=${youtubeId}` : (url || (query ? `ytsearch1:${query}` : ""));
    if (!target) return NextResponse.json({ error: "youtubeId or query is required", code: "missing-input", fix: "Provide a YouTube video ID, YouTube URL, or search query." }, { status: 400 });

    const cached = await readCachedMp3(target);
    const targetType = youtubeId ? "id" : url ? "url" : "query";
    if (cached) return new Response(new Uint8Array(cached.audio), { status: 200, headers: { "Content-Type": "audio/mpeg", "Content-Length": String(cached.audio.byteLength), "Content-Disposition": contentDisposition(cached.filename), "Cache-Control": "no-store", "X-PonotAI-Download-Cache": "hit", "X-PonotAI-Download-Target-Type": targetType } });

    tempDir = await fs.mkdtemp(path.join(tmpdir(), "ponotai-ytdlp-"));
    const cfg = resolveDownloaderConfig();
    const outputTemplate = path.join(tempDir, "%(title).200B.%(ext)s");
    const result = await runner(buildYtdlpArgs(target, outputTemplate), { cwd: tempDir, timeoutMs: cfg.timeoutMs, bin: cfg.ytdlpPath });
    if (result.code !== 0) throw new Error(firstUsefulDetail(result.stderr || result.stdout));
    const mp3 = (await fs.readdir(tempDir)).find((e) => e.toLowerCase().endsWith(".mp3"));
    if (!mp3) throw new Error("yt-dlp completed without producing an mp3 file");
    const audio = await fs.readFile(path.join(tempDir, mp3));
    await writeCachedMp3(target, audio, mp3);
    return new Response(new Uint8Array(audio), { status: 200, headers: { "Content-Type": "audio/mpeg", "Content-Length": String(audio.byteLength), "Content-Disposition": contentDisposition(mp3), "Cache-Control": "no-store", "X-PonotAI-Download-Cache": "miss", "X-PonotAI-Download-Target-Type": targetType } });
  } catch (error) {
    const c = classifyDownloadError(firstUsefulDetail(error instanceof Error ? error.message : String(error)), error);
    return NextResponse.json({ error: "YouTube download failed.", code: c.code, detail: c.detail, fix: c.fix }, { status: c.status });
  } finally { if (tempDir) await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined); }
}

export async function POST(request: Request): Promise<Response> { return handleDownloadPost(request); }
