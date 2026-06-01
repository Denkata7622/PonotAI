import { exec, spawn } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LucidaProfileId = "audiophile-flac" | "hifi-mp3" | "phone-aac-plus" | "normalized-mp3" | "analysis-only";
type AudioFormat = "flac" | "mp3" | "m4a";

type LucidaMetadata = {
  artist?: string;
  title?: string;
  album?: string;
  year?: number;
  genre?: string;
};

type LucidaEnhancements = {
  truePeakLimiter?: boolean;
  stereoEnhance?: boolean;
  embedCover?: boolean;
  embedMetadata?: boolean;
};

type LucidaRequestBody = {
  artist?: unknown;
  title?: unknown;
  url?: unknown;
  profile?: unknown;
  preview?: unknown;
  analyze?: unknown;
  coverArt?: unknown;
  metadata?: unknown;
  enhancements?: unknown;
  retryCount?: unknown;
};

type ProfileDescriptor = {
  id: LucidaProfileId;
  label: string;
  format: AudioFormat;
  extension: AudioFormat;
  contentType: "audio/flac" | "audio/mpeg" | "audio/mp4";
  bitrate: "lossless" | "320k" | "192k";
  codecArgs: string[];
  loudnorm: boolean;
  truePeakLimiter: boolean;
  stereoEnhance: boolean;
  metadata: boolean;
  cover: boolean;
  description: string;
};

type CommandResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  code?: number | null;
  errorCode?: string;
};

type TokenEntry = {
  filePath: string;
  tempDir: string;
  fileName: string;
  contentType: ProfileDescriptor["contentType"];
  createdAt: number;
  profile: LucidaProfileId;
};

type ProgressEvent = {
  step: "resolving" | "fetching" | "transcoding" | "metadata" | "complete" | "error";
  progress: number;
  message: string;
  file?: string;
  token?: string;
};

type ProcessResult = {
  requestId: string;
  tempDir: string;
  outputPath: string;
  fileName: string;
  contentType: ProfileDescriptor["contentType"];
  profile: LucidaProfileId;
  sourceUrl: string;
  analysis: Record<string, unknown> | null;
};

type StatusPayload = {
  online: boolean;
  lucidaUrl: string;
  docsStatus?: number;
  ffmpeg: { found: boolean; version?: string; error?: string; errorCode?: string };
  ffprobe: { found: boolean; version?: string; error?: string; errorCode?: string };
  temp: { dir: string; writable: boolean; error?: string };
  profiles: Array<ProfileDescriptor & { features: Record<string, boolean | string> }>;
  audioAnalysisAvailable: boolean;
  checkedAtIso: string;
};

const LUCIDA_BASE_URL = process.env.LUCIDA_FLOW_URL || process.env.LUCIDA_API_URL || "http://127.0.0.1:8000";
const REQUEST_TIMEOUT_MS = 120000;
const STATUS_TIMEOUT_MS = 3500;
const URL_RESOLVE_TIMEOUT_MS = 15000;
const OUTPUT_LIMIT = 128000;
const TOKEN_TTL_MS = 15 * 60 * 1000;
const DEFAULT_LUCIDA_RETRY_COUNT = 2;
const DEFAULT_ALBUM = "Turrex Export";
const DEFAULT_GENRE = "Unknown";
const execAsync = promisify(exec);
const tokenStore = new Map<string, TokenEntry>();

class LucidaStreamError extends Error {
  status?: number;
  detail?: string;

  constructor(message: string, status?: number, detail?: string) {
    super(message);
    this.name = "LucidaStreamError";
    this.status = status;
    this.detail = detail;
  }
}

const profiles: ProfileDescriptor[] = [
  {
    id: "audiophile-flac",
    label: "Audiophile FLAC",
    format: "flac",
    extension: "flac",
    contentType: "audio/flac",
    bitrate: "lossless",
    codecArgs: ["-c:a", "copy"],
    loudnorm: false,
    truePeakLimiter: false,
    stereoEnhance: false,
    metadata: true,
    cover: true,
    description: "Lossless FLAC with Vorbis comments and optional embedded picture block.",
  },
  {
    id: "hifi-mp3",
    label: "Hi-Fi MP3",
    format: "mp3",
    extension: "mp3",
    contentType: "audio/mpeg",
    bitrate: "320k",
    codecArgs: ["-c:a", "libmp3lame", "-b:a", "320k", "-id3v2_version", "4", "-write_id3v1", "1"],
    loudnorm: false,
    truePeakLimiter: true,
    stereoEnhance: true,
    metadata: true,
    cover: true,
    description: "320kbps MP3 with true peak limiting, subtle stereo widening, ID3v2.4 tags, and cover art.",
  },
  {
    id: "phone-aac-plus",
    label: "Phone AAC+",
    format: "m4a",
    extension: "m4a",
    contentType: "audio/mp4",
    bitrate: "192k",
    codecArgs: ["-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart"],
    loudnorm: true,
    truePeakLimiter: true,
    stereoEnhance: false,
    metadata: true,
    cover: true,
    description: "192kbps AAC/M4A with loudness normalization, faststart, metadata atoms, and cover art.",
  },
  {
    id: "normalized-mp3",
    label: "Normalized MP3",
    format: "mp3",
    extension: "mp3",
    contentType: "audio/mpeg",
    bitrate: "320k",
    codecArgs: ["-c:a", "libmp3lame", "-b:a", "320k", "-id3v2_version", "4", "-write_id3v1", "1"],
    loudnorm: true,
    truePeakLimiter: true,
    stereoEnhance: false,
    metadata: true,
    cover: true,
    description: "320kbps MP3 with loudness normalization, true peak protection, ID3v2.4 tags, and cover art.",
  },
  {
    id: "analysis-only",
    label: "Analysis Only",
    format: "mp3",
    extension: "mp3",
    contentType: "audio/mpeg",
    bitrate: "320k",
    codecArgs: ["-c:a", "libmp3lame", "-b:a", "320k", "-id3v2_version", "4", "-write_id3v1", "1"],
    loudnorm: false,
    truePeakLimiter: false,
    stereoEnhance: false,
    metadata: true,
    cover: true,
    description: "320kbps MP3 with metadata and analysis headers, without enhancement filters.",
  },
];

const profileById = Object.fromEntries(profiles.map((profile) => [profile.id, profile])) as Record<LucidaProfileId, ProfileDescriptor>;

function log(requestId: string, step: string, message: string, extra?: Record<string, unknown>) {
  const suffix = extra ? ` ${JSON.stringify(extra)}` : "";
  console.log(`[${new Date().toISOString()}] [lucida:${requestId}] ${step} ${message}${suffix}`);
}

function isLucidaProfileId(value: unknown): value is LucidaProfileId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(profileById, value);
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function retryCountFromUnknown(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.min(2, Math.floor(value)));
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.max(0, Math.min(2, Math.floor(parsed)));
  }
  return DEFAULT_LUCIDA_RETRY_COUNT;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function messageFromUnknown(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function numericYear(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const match = value.match(/\d{4}/);
    if (match) return Number(match[0]);
  }
  return undefined;
}

function metadataFromUnknown(value: unknown): LucidaMetadata {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  return {
    artist: stringField(record.artist),
    title: stringField(record.title),
    album: stringField(record.album),
    year: numericYear(record.year) ?? numericYear(record.date),
    genre: stringField(record.genre),
  };
}

function enhancementsFromUnknown(value: unknown): LucidaEnhancements {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  return {
    truePeakLimiter: typeof record.truePeakLimiter === "boolean" ? record.truePeakLimiter : undefined,
    stereoEnhance: typeof record.stereoEnhance === "boolean" ? record.stereoEnhance : undefined,
    embedCover: typeof record.embedCover === "boolean" ? record.embedCover : undefined,
    embedMetadata: typeof record.embedMetadata === "boolean" ? record.embedMetadata : undefined,
  };
}

function sanitizeFileName(input: string): string {
  const cleaned = input
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
  return cleaned || "Turrex Lucida Track";
}

function binaryFromLocation(location: string | undefined, binary: "ffmpeg" | "ffprobe"): string {
  if (!location) return binary;
  const normalized = location.replace(/\\/g, "/");
  if (normalized.endsWith("/ffmpeg") || normalized.endsWith("/ffmpeg.exe") || normalized.endsWith("/ffprobe") || normalized.endsWith("/ffprobe.exe")) {
    return location;
  }
  return path.join(location, process.platform === "win32" ? `${binary}.exe` : binary);
}

function capOutput(current: string, next: string): string {
  return (current + next).slice(-OUTPUT_LIMIT);
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function titleFromUrl(value: string): string {
  try {
    const parsed = new URL(value);
    const lastSegment = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() || "");
    return lastSegment || parsed.hostname || "Lucida Direct Download";
  } catch {
    return "Lucida Direct Download";
  }
}

function shellQuote(value: string): string {
  if (process.platform === "win32") return `"${value.replace(/"/g, '""')}"`;
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function classifyExecError(error: unknown): string {
  const err = error as { message?: unknown; stdout?: unknown; stderr?: unknown; code?: unknown; signal?: unknown; killed?: unknown };
  const details = [
    typeof err.stderr === "string" ? err.stderr : "",
    typeof err.stdout === "string" ? err.stdout : "",
    typeof err.message === "string" ? err.message : "",
  ].map((item) => item.trim()).filter(Boolean).join("\n");
  if (err.killed) return `yt-dlp timed out after ${URL_RESOLVE_TIMEOUT_MS}ms.`;
  return details || `yt-dlp failed${err.code ? ` with code ${String(err.code)}` : ""}${err.signal ? ` (${String(err.signal)})` : ""}.`;
}

async function execYtdlpPrint(target: string, template: string, timeoutMs = URL_RESOLVE_TIMEOUT_MS): Promise<string> {
  const ytdlpBinary = process.env.YTDLP_PATH || "yt-dlp";
  const command = `${shellQuote(ytdlpBinary)} --no-playlist --print ${shellQuote(template)} ${shellQuote(target)}`;
  const { stdout } = await execAsync(command, { timeout: timeoutMs, windowsHide: true, maxBuffer: OUTPUT_LIMIT });
  return stdout.trim();
}

async function resolveYoutubeUrl(query: string): Promise<string> {
  const attempts = [`${query} (remaster OR hq OR HD)`, query];
  const failures: string[] = [];
  for (const attempt of attempts) {
    try {
      const stdout = await execYtdlpPrint(`ytsearch1:${attempt}`, "webpage_url");
      const resolved = stdout.split(/\r?\n/).map((line) => line.trim()).find((line) => isHttpUrl(line));
      if (resolved) return resolved;
      failures.push(`No URL returned for ${attempt}.`);
    } catch (error) {
      failures.push(classifyExecError(error));
    }
  }
  throw new Error(`URL_RESOLUTION_FAILED: ${failures.join(" ")}`);
}

function cleanVideoTitle(value: string): { artist?: string; title: string } {
  const stripped = value
    .replace(/\[[^\]]*(official|video|audio|lyrics?|remaster(ed)?|hd|hq|4k)[^\]]*\]/gi, "")
    .replace(/\([^)]*(official|video|audio|lyrics?|remaster(ed)?|hd|hq|4k)[^)]*\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const match = stripped.match(/^(.+?)\s+-\s+(.+)$/);
  if (!match) return { title: stripped || value };
  return { artist: match[1]?.trim(), title: match[2]?.trim() || stripped };
}

async function extractMetadata(url: string): Promise<LucidaMetadata> {
  try {
    const output = await execYtdlpPrint(url, "%(title)s|||%(artist)s|||%(genre)s|||%(release_date)s", 12000);
    const [rawTitle = "", rawArtist = "", rawGenre = "", rawDate = ""] = output.split("|||");
    const titleParts = cleanVideoTitle(rawTitle.trim());
    return {
      artist: rawArtist.trim() || titleParts.artist,
      title: titleParts.title,
      genre: rawGenre.trim() || undefined,
      year: numericYear(rawDate),
    };
  } catch {
    return {};
  }
}

function mergeMetadata(frontend: LucidaMetadata, extracted: LucidaMetadata, fallback: { artist: string; title: string; url: string }): Required<LucidaMetadata> {
  const currentYear = new Date().getFullYear();
  return {
    artist: extracted.artist || frontend.artist || fallback.artist || "Unknown Artist",
    title: extracted.title || frontend.title || fallback.title || titleFromUrl(fallback.url),
    album: frontend.album || extracted.album || DEFAULT_ALBUM,
    year: frontend.year ?? extracted.year ?? currentYear,
    genre: extracted.genre || frontend.genre || DEFAULT_GENRE,
  };
}

function runCommand(binary: string, args: string[], timeoutMs = REQUEST_TIMEOUT_MS): Promise<CommandResult> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let child: ReturnType<typeof spawn>;

    const finish = (result: CommandResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => {
      child?.kill("SIGTERM");
      finish({ ok: false, stdout, stderr: stderr || "Command timed out.", errorCode: "TIMEOUT" });
    }, timeoutMs);

    try {
      child = spawn(binary, args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      finish({ ok: false, stdout, stderr: err.message, errorCode: err.code || "SPAWN_FAILED" });
      return;
    }

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout = capOutput(stdout, chunk.toString("utf8"));
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = capOutput(stderr, chunk.toString("utf8"));
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      finish({ ok: false, stdout, stderr: error.message, errorCode: error.code || "SPAWN_FAILED" });
    });
    child.on("close", (code) => {
      finish({ ok: code === 0, stdout, stderr, code, errorCode: code === 0 ? undefined : String(code) });
    });
  });
}

async function runProbe(binary: string, args: string[]): Promise<{ found: boolean; version?: string; error?: string; errorCode?: string }> {
  const result = await runCommand(binary, args, 8000);
  const output = `${result.stdout}\n${result.stderr}`.trim();
  if (result.ok) {
    return {
      found: true,
      version: output.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "available",
    };
  }
  return {
    found: false,
    error: output || "Command failed.",
    errorCode: result.errorCode,
  };
}

async function checkTempWritable(dir: string): Promise<StatusPayload["temp"]> {
  const probeDir = await mkdtemp(path.join(dir, "turrex-lucida-status-"));
  const probeFile = path.join(probeDir, "probe.txt");
  try {
    await writeFile(probeFile, "ok");
    return { dir, writable: true };
  } catch (error) {
    return { dir, writable: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    await rm(probeDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function writeLucidaStreamOnce(sourceUrl: string, targetPath: string): Promise<void> {
  const response = await fetchWithTimeout(`${LUCIDA_BASE_URL}/download`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: sourceUrl, format: "flac" }),
  }, REQUEST_TIMEOUT_MS);

  if (!response.ok || !response.body) {
    let detail = "";
    try {
      detail = await response.text();
    } catch {
      detail = "";
    }
    const trimmed = detail.trim();
    throw new LucidaStreamError(`Lucida returned ${response.status}${trimmed ? `: ${trimmed.slice(0, 1800)}` : ""}`, response.status, trimmed);
  }

  await pipeline(Readable.fromWeb(response.body as unknown as Parameters<typeof Readable.fromWeb>[0]), createWriteStream(targetPath));
}

function isRetryableLucidaError(error: unknown): boolean {
  if (error instanceof LucidaStreamError) return typeof error.status === "number" && error.status >= 500;
  const lower = messageFromUnknown(error).toLowerCase();
  return lower.includes("fetch failed") || lower.includes("econnrefused") || lower.includes("etimedout") || lower.includes("timeout");
}

async function writeLucidaStreamToFile(sourceUrl: string, targetPath: string, retryCount: number, requestId: string, emit?: (event: ProgressEvent) => void | Promise<void>): Promise<void> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    try {
      if (attempt > 0) {
        await emit?.({
          step: "fetching",
          progress: Math.min(45, 30 + attempt * 5),
          message: `Lucida retry ${attempt} of ${retryCount}...`,
        });
      }
      await writeLucidaStreamOnce(sourceUrl, targetPath);
      return;
    } catch (error) {
      lastError = error;
      if (!isRetryableLucidaError(error) || attempt >= retryCount) break;
      const delayMs = 1000 * (2 ** attempt);
      log(requestId, "fetching", "Lucida fetch failed; retrying", { attempt: attempt + 1, retryCount, delayMs, error: messageFromUnknown(error).slice(0, 600) });
      await sleep(delayMs);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Lucida FLAC fetch failed.");
}

async function downloadFlacWithYtdlp(sourceUrl: string, targetPath: string, requestId: string): Promise<void> {
  const ytdlpBinary = process.env.YTDLP_PATH || "yt-dlp";
  log(requestId, "fetching", "starting yt-dlp FLAC fallback", { sourceUrl });
  const result = await runCommand(ytdlpBinary, [
    "-f", "bestaudio",
    "--extract-audio",
    "--audio-format", "flac",
    "-o", targetPath,
    sourceUrl,
  ], REQUEST_TIMEOUT_MS);

  if (!result.ok) {
    const detail = `${result.stderr || result.stdout || "yt-dlp fallback failed."}`.replace(/\s+/g, " ").trim();
    throw new Error(`yt-dlp FLAC fallback failed: ${detail.slice(0, 1200)}`);
  }

  const stats = await stat(targetPath).catch(() => null);
  if (!stats || stats.size === 0) {
    throw new Error("yt-dlp FLAC fallback completed but did not create a usable audio file.");
  }
}

function coverInfoFromBase64(input: unknown): { bytes: Buffer; extension: ".jpg" | ".png" } | null {
  if (typeof input !== "string" || !input.trim()) return null;
  const trimmed = input.trim();
  const dataUrlMatch = trimmed.match(/^data:(image\/(?:jpeg|jpg|png));base64,(.+)$/i);
  const mime = dataUrlMatch?.[1]?.toLowerCase();
  const encoded = dataUrlMatch?.[2] ?? trimmed;
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.byteLength === 0) return null;
  return { bytes, extension: mime?.includes("png") ? ".png" : ".jpg" };
}

async function writeCoverArt(coverArt: unknown, tempDir: string): Promise<string | undefined> {
  const cover = coverInfoFromBase64(coverArt);
  if (!cover) return undefined;
  const coverPath = path.join(tempDir, `cover${cover.extension}`);
  await writeFile(coverPath, cover.bytes);
  return coverPath;
}

function buildFilterChain(profile: ProfileDescriptor, enhancements: LucidaEnhancements): string[] {
  if (profile.id === "audiophile-flac") return [];
  const truePeakLimiter = enhancements.truePeakLimiter ?? profile.truePeakLimiter;
  const stereoEnhance = enhancements.stereoEnhance ?? profile.stereoEnhance;
  const filters: string[] = [];
  if (profile.loudnorm) filters.push("loudnorm=I=-16:LRA=11:TP=-1.5:print_format=json");
  if (truePeakLimiter) filters.push("alimiter=limit=-1.0dB:attack=5:release=50:level=disabled");
  if (stereoEnhance) filters.push("stereotools=mode=lr>ms:ms_lr_balance=0.25,stereotools=mode=ms>lr");
  return filters;
}

function metadataArgs(metadata: Required<LucidaMetadata>, enabled: boolean): string[] {
  if (!enabled) return [];
  return [
    "-metadata", `artist=${metadata.artist}`,
    "-metadata", `title=${metadata.title}`,
    "-metadata", `album=${metadata.album}`,
    "-metadata", `date=${metadata.year}`,
    "-metadata", `genre=${metadata.genre}`,
  ];
}

function buildFfmpegArgs(profile: ProfileDescriptor, input: string, output: string, options: {
  coverPath?: string;
  metadata: Required<LucidaMetadata>;
  enhancements: LucidaEnhancements;
  preview: boolean;
}): string[] {
  const embedMetadata = options.enhancements.embedMetadata ?? profile.metadata;
  const embedCover = Boolean(options.coverPath && (options.enhancements.embedCover ?? profile.cover));
  const filters = buildFilterChain(profile, options.enhancements);
  const args = ["-hide_banner", "-nostdin", "-y"];
  if (options.preview) args.push("-ss", "0", "-t", "30");
  args.push("-i", input);
  if (embedCover && options.coverPath) args.push("-i", options.coverPath);
  args.push("-map", "0:a:0");
  if (embedCover) args.push("-map", "1:v:0", "-disposition:v:0", "attached_pic");
  args.push(...profile.codecArgs);
  if (embedCover) args.push("-c:v", "copy", "-metadata:s:v", "title=Album cover", "-metadata:s:v", "comment=Cover (front)");
  if (filters.length > 0) args.push("-af", filters.join(","));
  args.push(...metadataArgs(options.metadata, embedMetadata));
  args.push(output);
  return args;
}

async function runFfmpeg(profile: ProfileDescriptor, inputPath: string, outputPath: string, options: {
  coverPath?: string;
  metadata: Required<LucidaMetadata>;
  enhancements: LucidaEnhancements;
  preview: boolean;
}): Promise<void> {
  const ffmpegBinary = binaryFromLocation(process.env.FFMPEG_LOCATION, "ffmpeg");
  const args = buildFfmpegArgs(profile, inputPath, outputPath, options);
  const result = await runCommand(ffmpegBinary, args, REQUEST_TIMEOUT_MS);
  if (!result.ok) {
    const detail = `${result.stderr || result.stdout || "ffmpeg failed."}`.replace(/\s+/g, " ").trim();
    throw new Error(`ffmpeg processing failed: ${detail.slice(0, 520)}`);
  }
}

async function analyzeAudio(filePath: string): Promise<Record<string, unknown>> {
  const ffprobeBinary = binaryFromLocation(process.env.FFMPEG_LOCATION, "ffprobe");
  const ffprobe = await runCommand(ffprobeBinary, [
    "-v", "error",
    "-show_format",
    "-show_streams",
    "-print_format", "json",
    filePath,
  ], 15000);

  let probe: unknown = null;
  if (ffprobe.ok && ffprobe.stdout.trim()) {
    try {
      probe = JSON.parse(ffprobe.stdout) as unknown;
    } catch {
      probe = { raw: ffprobe.stdout.slice(0, 4000) };
    }
  }

  const ffmpegBinary = binaryFromLocation(process.env.FFMPEG_LOCATION, "ffmpeg");
  const loudness = await runCommand(ffmpegBinary, [
    "-hide_banner",
    "-nostdin",
    "-i", filePath,
    "-af", "loudnorm=I=-16:LRA=11:TP=-1.5:print_format=json",
    "-f", "null",
    "-",
  ], 30000);

  return {
    generatedAtIso: new Date().toISOString(),
    probe,
    loudness: parseLoudnormOutput(loudness.stderr),
    probeError: ffprobe.ok ? undefined : (ffprobe.stderr || ffprobe.errorCode),
    loudnessError: loudness.ok ? undefined : (loudness.stderr || loudness.errorCode),
  };
}

function parseLoudnormOutput(stderr: string): Record<string, unknown> | null {
  const start = stderr.lastIndexOf("{");
  const end = stderr.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(stderr.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function encodeHeaderJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function dispositionFileName(fileName: string): string {
  return fileName.replace(/["\r\n]/g, "_");
}

function errorResponse(message: string, status = 500, extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ error: message, detail: message, ...extra }, { status });
}

function pruneTokenStore() {
  const now = Date.now();
  for (const [token, entry] of tokenStore.entries()) {
    if (now - entry.createdAt <= TOKEN_TTL_MS) continue;
    tokenStore.delete(token);
    void rm(entry.tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function processLucidaDownload(body: LucidaRequestBody, emit?: (event: ProgressEvent) => void | Promise<void>): Promise<ProcessResult> {
  const requestId = crypto.randomUUID();
  const tempDir = await mkdtemp(path.join(tmpdir(), "turrex-lucida-"));
  const inputPath = path.join(tempDir, "source.flac");
  let outputPath = "";

  try {
    const artist = stringField(body.artist);
    const title = stringField(body.title);
    const directUrl = stringField(body.url);
    const preview = Boolean(body.preview);
    const requestedProfile = isLucidaProfileId(body.profile) ? body.profile : "hifi-mp3";
    const profile = preview ? profileById["hifi-mp3"] : profileById[requestedProfile];
    const analyze = Boolean(body.analyze) || profile.id === "analysis-only";
    const frontendMetadata = metadataFromUnknown(body.metadata);
    const enhancements = enhancementsFromUnknown(body.enhancements);
    const retryCount = retryCountFromUnknown(body.retryCount);

    if (!directUrl && (!artist || !title)) {
      throw new Error("Provide either a direct url or both artist and title.");
    }
    if (directUrl && !isHttpUrl(directUrl)) {
      throw new Error("The url field must be a valid http or https URL.");
    }

    emit?.({ step: "resolving", progress: 10, message: directUrl ? "Using direct source URL..." : "Resolving high-quality YouTube result..." });
    log(requestId, "resolving", directUrl ? "using direct URL" : "resolving search query", { query: [artist, title].filter(Boolean).join(" ") });
    const query = [artist, title].filter(Boolean).join(" ").trim();
    const sourceUrl = directUrl || await resolveYoutubeUrl(query);

    log(requestId, "metadata", "extracting source metadata");
    const extractedMetadata = await extractMetadata(sourceUrl);
    const metadata = mergeMetadata(frontendMetadata, extractedMetadata, { artist, title, url: sourceUrl });
    const coverPath = (enhancements.embedCover ?? profile.cover) ? await writeCoverArt(body.coverArt, tempDir) : undefined;

    emit?.({ step: "fetching", progress: 30, message: "Fetching lossless FLAC stream from Lucida..." });
    log(requestId, "fetching", "requesting FLAC from Lucida", { sourceUrl, retryCount });
    try {
      await writeLucidaStreamToFile(sourceUrl, inputPath, retryCount, requestId, emit);
    } catch (lucidaError) {
      const lucidaMessage = messageFromUnknown(lucidaError);
      log(requestId, "fetching", "Lucida failed; attempting yt-dlp fallback", { error: lucidaMessage.slice(0, 900) });
      emit?.({ step: "fetching", progress: 48, message: "Lucida failed; falling back to direct FLAC extraction..." });
      try {
        await downloadFlacWithYtdlp(sourceUrl, inputPath, requestId);
      } catch (fallbackError) {
        const fallbackMessage = messageFromUnknown(fallbackError);
        throw new Error(`Lucida failed after ${retryCount + 1} attempt${retryCount === 0 ? "" : "s"}: ${lucidaMessage}. Direct yt-dlp FLAC fallback also failed: ${fallbackMessage}`);
      }
    }
    const inputStats = await stat(inputPath).catch(() => null);
    if (!inputStats || inputStats.size === 0) throw new Error("The audio source returned an empty FLAC stream.");

    outputPath = path.join(tempDir, `${preview ? "preview" : "output"}.${profile.extension}`);
    emit?.({ step: "transcoding", progress: 60, message: preview ? "Rendering 30 second Hi-Fi MP3 preview..." : `Processing ${profile.label}...` });
    log(requestId, "transcoding", "running ffmpeg", { profile: profile.id, preview });
    await runFfmpeg(profile, inputPath, outputPath, { coverPath, metadata, enhancements, preview });

    if (!existsSync(outputPath)) throw new Error("Audio processor did not create an output file.");
    const outputStats = await stat(outputPath);
    if (outputStats.size === 0) throw new Error("Audio processor created an empty output file.");

    emit?.({ step: "metadata", progress: 85, message: "Finalizing metadata, cover art, and analysis..." });
    const analysis = analyze ? await analyzeAudio(outputPath).catch((error) => ({
      generatedAtIso: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Audio analysis failed.",
    })) : null;

    const safeBase = sanitizeFileName(`${metadata.artist ? `${metadata.artist} - ` : ""}${metadata.title}`);
    const fileName = `${preview ? "preview_" : ""}${safeBase}.${profile.extension}`;
    log(requestId, "complete", "download ready", { fileName, profile: profile.id });
    return { requestId, tempDir, outputPath, fileName, contentType: profile.contentType, profile: profile.id, sourceUrl, analysis };
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

function statusFromError(error: unknown): number {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (message.startsWith("URL_RESOLUTION_FAILED:")) return 502;
  if (lower.includes("lucida returned") || lower.includes("lucida failed") || lower.includes("yt-dlp") || lower.includes("fetch failed") || lower.includes("econnrefused")) return 502;
  if (lower.includes("ffmpeg") || lower.includes("audio processor")) return 500;
  return 400;
}

function responseHeaders(result: ProcessResult, bufferLength?: number): Headers {
  const headers = new Headers({
    "Content-Type": result.contentType,
    "Content-Disposition": `attachment; filename="${dispositionFileName(result.fileName)}"`,
    "Cache-Control": "no-store",
    "X-Turrex-Lucida-Profile": result.profile,
    "X-Turrex-Filename": encodeURIComponent(result.fileName),
    "X-Turrex-Request-ID": result.requestId,
    "X-Turrex-Source-URL": encodeURIComponent(result.sourceUrl),
  });
  if (typeof bufferLength === "number") headers.set("Content-Length", String(bufferLength));
  if (result.analysis) headers.set("X-Audio-Analysis", encodeHeaderJson(result.analysis));
  return headers;
}

async function handleDownloadToken(token: string | null): Promise<Response> {
  pruneTokenStore();
  if (!token) return errorResponse("Missing download token.", 400);
  const entry = tokenStore.get(token);
  if (!entry) return errorResponse("Download token expired or was already used.", 404);
  tokenStore.delete(token);
  try {
    const buffer = await readFile(entry.filePath);
    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": entry.contentType,
        "Content-Length": String(buffer.byteLength),
        "Content-Disposition": `attachment; filename="${dispositionFileName(entry.fileName)}"`,
        "Cache-Control": "no-store",
        "X-Turrex-Lucida-Profile": entry.profile,
      },
    });
  } finally {
    await rm(entry.tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function sseLine(event: ProgressEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function GET(request: NextRequest): Promise<Response> {
  const action = request.nextUrl.searchParams.get("action");
  if (action === "download") {
    return handleDownloadToken(request.nextUrl.searchParams.get("token"));
  }
  if (action !== "status") {
    return errorResponse("Unsupported Lucida GET action.", 400);
  }

  const ffmpegBinary = binaryFromLocation(process.env.FFMPEG_LOCATION, "ffmpeg");
  const ffprobeBinary = binaryFromLocation(process.env.FFMPEG_LOCATION, "ffprobe");
  const [docs, ffmpeg, ffprobe, temp] = await Promise.allSettled([
    fetchWithTimeout(`${LUCIDA_BASE_URL}/docs`, { method: "GET" }, STATUS_TIMEOUT_MS),
    runProbe(ffmpegBinary, ["-version"]),
    runProbe(ffprobeBinary, ["-version"]),
    checkTempWritable(tmpdir()),
  ]);

  const docsStatus = docs.status === "fulfilled" ? docs.value.status : undefined;
  const online = docs.status === "fulfilled" && docs.value.ok;
  const ffmpegResult = ffmpeg.status === "fulfilled" ? ffmpeg.value : { found: false, error: "ffmpeg probe failed." };
  const ffprobeResult = ffprobe.status === "fulfilled" ? ffprobe.value : { found: false, error: "ffprobe probe failed." };
  const tempResult = temp.status === "fulfilled" ? temp.value : { dir: tmpdir(), writable: false, error: "Temp directory probe failed." };

  return NextResponse.json({
    online,
    lucidaUrl: LUCIDA_BASE_URL,
    docsStatus,
    ffmpeg: ffmpegResult,
    ffprobe: ffprobeResult,
    temp: tempResult,
    profiles: profiles.map((profile) => ({
      ...profile,
      features: {
        loudnorm: profile.loudnorm,
        truePeakLimiter: profile.truePeakLimiter,
        stereoEnhance: profile.stereoEnhance,
        metadata: profile.metadata,
        cover: profile.cover,
        bitrate: profile.bitrate,
      },
    })),
    audioAnalysisAvailable: ffprobeResult.found,
    checkedAtIso: new Date().toISOString(),
  } satisfies StatusPayload);
}

export async function POST(request: NextRequest): Promise<Response> {
  const wantsSse = request.headers.get("accept")?.toLowerCase().includes("text/event-stream") ?? false;
  let body: LucidaRequestBody;
  try {
    body = await request.json() as LucidaRequestBody;
  } catch {
    return errorResponse("Invalid JSON body.", 400);
  }
  const retryParam = request.nextUrl.searchParams.get("retry");
  if (retryParam !== null && typeof body.retryCount === "undefined") {
    body = { ...body, retryCount: retryParam };
  }

  if (wantsSse) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (event: ProgressEvent) => controller.enqueue(encoder.encode(sseLine(event)));
        void (async () => {
          try {
            pruneTokenStore();
            const result = await processLucidaDownload(body, send);
            const token = crypto.randomUUID();
            tokenStore.set(token, {
              filePath: result.outputPath,
              tempDir: result.tempDir,
              fileName: result.fileName,
              contentType: result.contentType,
              createdAt: Date.now(),
              profile: result.profile,
            });
            send({
              step: "complete",
              progress: 100,
              message: "Download ready",
              token,
              file: `/api/download/lucida?action=download&token=${encodeURIComponent(token)}`,
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : "Lucida download failed.";
            send({ step: "error", progress: 100, message });
          } finally {
            controller.close();
          }
        })();
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  let result: ProcessResult | null = null;
  try {
    result = await processLucidaDownload(body);
    const buffer = await readFile(result.outputPath);
    return new Response(buffer, { status: 200, headers: responseHeaders(result, buffer.byteLength) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lucida download failed.";
    return errorResponse(message, statusFromError(error), { requestId: result?.requestId });
  } finally {
    if (result?.tempDir) await rm(result.tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
