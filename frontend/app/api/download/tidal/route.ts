/*
 * Bugs fixed in this file:
 * - The local TIDAL token file can be base64/base64url-encoded JSON rather than
 *   plain JSON, so token discovery missed valid access tokens and search failed.
 * - Token expiry from the token file was ignored, which made status/search look
 *   available even when the access token was already expired.
 * - TIDAL 429 search responses were returned immediately instead of being
 *   treated as transient API failures with bounded backoff retries.
 * - The status endpoint did not expose search token expiry or remaining search
 *   capacity, so the frontend could not make stable auto-assignment decisions.
 * - tidekeeper was hard-coded to `-q Master`; many tracks now produce no files
 *   at that quality even when the CLI exits successfully. Downloads now try
 *   Max, Lossless, then High, running from an isolated temp directory and
 *   reading files from tidekeeper's cwd-relative `download` folder.
 */
import { exec, spawn } from "node:child_process";
import { access, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TidalProfileId = "audiophile-flac" | "hifi-mp3" | "phone-aac-plus" | "normalized-mp3" | "analysis-only";
type AudioFormat = "flac" | "mp3" | "m4a";
type DownloadSource = "tidal" | "soulseek";

type TidalEnhancements = {
  loudnorm?: boolean;
  trimSilence?: boolean;
  fadeInOut?: boolean;
  truePeakLimiter?: boolean;
  stereoEnhance?: boolean;
  embedCover?: boolean;
  embedMetadata?: boolean;
  musicbrainz?: boolean;
  lyrics?: boolean;
  verifyQuality?: boolean;
  coverFallback?: boolean;
  generatePlaylist?: boolean;
  resizeCover?: boolean;
};

type TidalRequestBody = {
  url?: unknown;
  tracks?: unknown;
  profile?: unknown;
  preview?: unknown;
  coverArt?: unknown;
  enhancements?: unknown;
  useSoulseekFallback?: unknown;
  libraryPath?: unknown;
  metadataOverride?: unknown;
  force?: unknown;
  filenameTemplate?: unknown;
  postAction?: unknown;
  postCommand?: unknown;
};

type ProfileDescriptor = {
  id: TidalProfileId;
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

type TidalDownloadQuality = typeof TIDAL_DOWNLOAD_QUALITIES[number];
type TidalDownloadAttemptFailure = {
  quality: TidalDownloadQuality;
  exitCode?: number | null;
  stderr: string;
  stdout: string;
  filesFound: number;
};

type AudioMetadata = {
  artist: string;
  title: string;
  album: string;
  year?: string;
  genre?: string;
  lyrics?: string;
  releaseMbid?: string;
};

type SourceAudioFile = {
  filePath: string;
  metadata: AudioMetadata;
  codec?: string;
  bitrateKbps?: number;
  durationSec?: number;
  sampleRate?: number;
  channels?: number;
  sizeBytes?: number;
  qualityReport?: QualityReport;
};

type PreparedSourceAudioFile = SourceAudioFile & {
  itemCoverPath?: string;
  itemSource: DownloadSource;
  itemSourceUrl: string;
};

type TidalTrackInput = {
  artist: string;
  title: string;
  album?: string;
  year?: string;
  genre?: string;
  coverArt?: unknown;
  url?: string;
};

type AlbumMetaEntry = {
  artist: string;
  title: string;
  trackNumber: number;
  duration?: number;
  file: string;
};

type QualityReport = {
  file: string;
  codec?: string;
  bitrateKbps?: number;
  sampleRate?: number;
  channels?: number;
  durationSec?: number;
  sizeBytes?: number;
  nyquistHz?: number;
  highFrequencyThresholdHz?: number;
  highFrequencyRmsDb?: number;
  passed: boolean;
  warnings: string[];
};

type TokenEntry = {
  zipPath: string;
  tempDir: string;
  fileName: string;
  createdAt: number;
  requestId: string;
  profile: TidalProfileId;
  sourceUrl: string;
  source: DownloadSource;
  trackCount: number;
  albumMeta?: AlbumMetaEntry[];
  postAction?: "openFolder" | "notify" | "moveToLibrary";
};

type ProgressEvent = {
  step: "validating" | "downloading" | "transcoding" | "zipping" | "complete" | "error";
  progress: number;
  message: string;
  file?: string;
  token?: string;
  source?: DownloadSource;
  retryAfter?: number;
  status?: number;
  skipped?: boolean;
  reason?: "duplicate";
  existingFile?: string;
  byteLength?: number;
  durationSec?: number;
  zipPath?: string;
  albumMeta?: AlbumMetaEntry[];
};

type ProcessResult = {
  requestId: string;
  tempDir: string;
  zipPath: string;
  fileName: string;
  profile: TidalProfileId;
  sourceUrl: string;
  source: DownloadSource;
  trackCount: number;
  skipped?: boolean;
  reason?: "duplicate";
  existingFile?: string;
  albumMeta?: AlbumMetaEntry[];
  postAction?: "openFolder" | "notify" | "moveToLibrary";
};

type CachedTidalAccessToken = {
  value: string;
  cacheExpiresAt: number;
  tokenExpiry?: string;
};

type ToolDiagnostic = { available: boolean; version?: string; error?: string; errorCode?: string };
type TidalToolDiagnostic = ToolDiagnostic & {
  configPath: string;
  configExists: boolean;
  loggedIn: boolean;
  doctor?: string;
  updateAvailable?: boolean;
  latestVersion?: string;
};

type StatusPayload = {
  tidal: TidalToolDiagnostic;
  soulseek: ToolDiagnostic;
  ffmpeg: ToolDiagnostic;
  ffprobe: ToolDiagnostic;
  tokenExpiry?: string;
  lyricsAvailable: boolean;
  musicbrainzAvailable: boolean;
  searchAvailable: boolean;
  tidalSearch: {
    available: boolean;
    message: string;
    tokenExpiry?: string;
    rateLimitRemaining: number;
  };
  profiles: Array<ProfileDescriptor & { features: Record<string, boolean | string> }>;
  tempDir: string;
  writable: boolean;
  checkedAtIso: string;
};

class DownloaderError extends Error {
  status: number;
  retryAfter?: number;
  detail?: string;

  constructor(message: string, status = 500, options?: { retryAfter?: number; detail?: string }) {
    super(message);
    this.name = "DownloaderError";
    this.status = status;
    this.retryAfter = options?.retryAfter;
    this.detail = options?.detail;
  }
}

const TIDAL_TIMEOUT_MS = 180000;
const SLSK_TIMEOUT_MS = 300000;
const FFMPEG_TIMEOUT_MS = 180000;
const STATUS_TIMEOUT_MS = 8000;
const INFO_TIMEOUT_MS = 45000;
const EXTERNAL_API_TIMEOUT_MS = 8000;
const TIDAL_SEARCH_TIMEOUT_MS = 10000;
const EXTERNAL_SERVICE_CACHE_MS = 5 * 60 * 1000;
const UPDATE_CACHE_MS = 30 * 60 * 1000;
const OUTPUT_LIMIT = 128000;
const TOKEN_TTL_MS = 15 * 60 * 1000;
const TIDAL_TOKEN_CACHE_MS = 60 * 60 * 1000;
const TIDAL_SEARCH_WINDOW_MS = 30 * 1000;
const TIDAL_SEARCH_MAX_REQUESTS = 10;
const TIDAL_SEARCH_MIN_INTERVAL_MS = 1000;
const TIDAL_DOWNLOAD_QUALITIES = ["Max", "Lossless", "High"] as const;
const ZIP_UINT16_MAX = 0xffff;
const ZIP_UINT32_MAX = 0xffffffff;
const ZIP_LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const ZIP_EOCD_SIGNATURE = 0x06054b50;
const ZIP_VERSION_NEEDED = 20;
const ZIP_VERSION_MADE_BY = 20;
const ZIP_UTF8_FLAG = 0x0800;
const ZIP_STORE_METHOD = 0;
const DEFAULT_ALBUM = "Turrex TIDAL Export";
const AUDIO_EXTENSIONS = new Set([".flac", ".m4a", ".mp3"]);
const encoder = new TextEncoder();
const tokenStore = new Map<string, TokenEntry>();
const serviceStatusCache = new Map<string, { checkedAt: number; available: boolean }>();
let updateStatusCache: { checkedAt: number; updateAvailable: boolean; latestVersion?: string } | null = null;
let cachedToken: CachedTidalAccessToken | null = null;
let lastTidalTokenError: string | null = null;
let searchRequestTimestamps: number[] = [];
let lastTidalSearchRequestAt = 0;
let searchRateLimiterQueue: Promise<void> = Promise.resolve();

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
    description: "Lossless FLAC with Vorbis comments and optional embedded cover art.",
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
    description: "320kbps MP3 with true peak limiting, stereo enhancement, ID3 tags, and cover art.",
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
    description: "192kbps AAC/M4A with loudness normalization, faststart playback, metadata, and cover art.",
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
    description: "320kbps MP3 with loudness normalization, true peak protection, metadata, and cover art.",
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
    description: "320kbps MP3 with metadata and analysis headers.",
  },
];

const profileById = Object.fromEntries(profiles.map((profile) => [profile.id, profile])) as Record<TidalProfileId, ProfileDescriptor>;

function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isTidalProfileId(value: unknown): value is TidalProfileId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(profileById, value);
}

function isTidalUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    const segments = parsed.pathname.split("/").filter(Boolean).map((segment) => segment.toLowerCase());
    const kind = segments[0] === "browse" ? segments[1] : segments[0];
    return (host === "tidal.com" || host === "listen.tidal.com" || host.endsWith(".tidal.com"))
      && ["track", "album", "playlist", "mix"].includes(kind ?? "")
      && Boolean(segments[0] === "browse" ? segments[2] : segments[1]);
  } catch {
    return false;
  }
}

function classifyTidalUrl(value: string): "track" | "album" | "playlist" | "mix" {
  try {
    const segments = new URL(value).pathname.split("/").filter(Boolean).map((segment) => segment.toLowerCase());
    const kind = segments[0] === "browse" ? segments[1] : segments[0];
    return kind === "album" || kind === "playlist" || kind === "mix" ? kind : "track";
  } catch {
    return "track";
  }
}

function enhancementsFromUnknown(value: unknown): TidalEnhancements {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  return {
    loudnorm: typeof record.loudnorm === "boolean" ? record.loudnorm : undefined,
    trimSilence: typeof record.trimSilence === "boolean" ? record.trimSilence : undefined,
    fadeInOut: typeof record.fadeInOut === "boolean" ? record.fadeInOut : undefined,
    truePeakLimiter: typeof record.truePeakLimiter === "boolean" ? record.truePeakLimiter : undefined,
    stereoEnhance: typeof record.stereoEnhance === "boolean" ? record.stereoEnhance : undefined,
    embedCover: typeof record.embedCover === "boolean" ? record.embedCover : undefined,
    embedMetadata: typeof record.embedMetadata === "boolean" ? record.embedMetadata : undefined,
    musicbrainz: typeof record.musicbrainz === "boolean" ? record.musicbrainz : undefined,
    lyrics: typeof record.lyrics === "boolean" ? record.lyrics : undefined,
    verifyQuality: typeof record.verifyQuality === "boolean" ? record.verifyQuality : undefined,
    coverFallback: typeof record.coverFallback === "boolean" ? record.coverFallback : undefined,
    generatePlaylist: typeof record.generatePlaylist === "boolean" ? record.generatePlaylist : undefined,
    resizeCover: typeof record.resizeCover === "boolean" ? record.resizeCover : undefined,
  };
}

function metadataOverrideFromUnknown(value: unknown): Partial<AudioMetadata> {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  return {
    artist: stringField(record.artist),
    title: stringField(record.title),
    album: stringField(record.album),
    year: stringField(record.year),
    genre: stringField(record.genre),
  };
}

function tracksFromUnknown(value: unknown): TidalTrackInput[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry): TidalTrackInput | null => {
    if (!entry || typeof entry !== "object") return null;
    const record = entry as Record<string, unknown>;
    const artist = stringField(record.artist);
    const title = stringField(record.title);
    if (!artist && !title) return null;
    const url = stringField(record.url);
    return {
      artist,
      title,
      album: stringField(record.album) || undefined,
      year: stringField(record.year) || undefined,
      genre: stringField(record.genre) || undefined,
      coverArt: record.coverArt,
      url: url && isTidalUrl(url) ? url : undefined,
    };
  }).filter((entry): entry is TidalTrackInput => entry !== null);
}

function tidalBinary(): string {
  return process.env.TIDAL_DL_NG_PATH || "tidekeeper";
}

function soulseekBinary(): string {
  return process.env.SLSK_BATCHDL_PATH || "sldl";
}

function binaryFromLocation(location: string | undefined, binary: "ffmpeg" | "ffprobe"): string {
  if (!location) return binary;
  const normalized = location.replace(/\\/g, "/").toLowerCase();
  if (normalized.endsWith("/ffmpeg") || normalized.endsWith("/ffmpeg.exe") || normalized.endsWith("/ffprobe") || normalized.endsWith("/ffprobe.exe")) {
    return location;
  }
  return path.join(location, process.platform === "win32" ? `${binary}.exe` : binary);
}

function ffmpegBinary(): string {
  return process.env.FFMPEG_PATH || binaryFromLocation(process.env.FFMPEG_LOCATION, "ffmpeg");
}

function ffprobeBinary(): string {
  return process.env.FFPROBE_PATH || binaryFromLocation(process.env.FFMPEG_LOCATION, "ffprobe");
}

function tidalConfigPath(): string {
  if (process.env.TIDAL_TOKEN_PATH) return process.env.TIDAL_TOKEN_PATH;
  return process.platform === "win32" ? "C:\\Users\\denis\\.tidal-dl.token.json" : path.join(homedir(), ".tidal-dl.token.json");
}

function capOutput(current: string, next: string): string {
  return (current + next).slice(-OUTPUT_LIMIT);
}

function messageFromUnknown(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function commandEnv(proxy?: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, PYTHONUTF8: "1", LANG: "C.UTF-8", PYTHONIOENCODING: "utf-8" };
  if (proxy) {
    env.HTTP_PROXY = proxy;
    env.HTTPS_PROXY = proxy;
    env.http_proxy = proxy;
    env.https_proxy = proxy;
  }
  return env;
}

function runCommand(binary: string, args: string[], timeoutMs: number, cwd?: string, options?: { env?: NodeJS.ProcessEnv }): Promise<CommandResult> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let child: ReturnType<typeof spawn> | null = null;

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
      child = spawn(binary, args, { cwd, shell: false, stdio: ["ignore", "pipe", "pipe"], windowsHide: true, env: options?.env });
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

async function runProbe(binary: string, args: string[]): Promise<ToolDiagnostic> {
  const result = await runCommand(binary, args, STATUS_TIMEOUT_MS);
  const output = `${result.stdout}\n${result.stderr}`.trim();
  if (result.ok) {
    return {
      available: true,
      version: output.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "available",
    };
  }
  return {
    available: false,
    error: output || "Command failed.",
    errorCode: result.errorCode,
  };
}

function doctorLoggedIn(output: string, ok: boolean): boolean {
  const lower = output.toLowerCase();
  if (lower.includes("not logged in") || lower.includes("unauthorized") || lower.includes("expired") || lower.includes("invalid token") || lower.includes("login required")) {
    return false;
  }
  if (lower.includes("logged in") || lower.includes("authenticated") || lower.includes("token valid") || lower.includes("login ok")) {
    return true;
  }
  return ok && output.trim().length > 0;
}

function looksLikeCliUsage(output: string): boolean {
  const lower = output.toLowerCase();
  return lower.includes("usage:") || lower.includes("no such option") || lower.includes("unknown option") || lower.includes("try ") && lower.includes("--help");
}

function looksLikeTiddlCli(output: string): boolean {
  const lower = output.toLowerCase();
  return lower.includes("usage: tiddl") || lower.includes("tiddl [options]");
}

function firstOutputLine(...outputs: string[]): string | undefined {
  for (const output of outputs) {
    const line = output.split(/\r?\n/).map((entry) => entry.trim()).find(Boolean);
    if (line) return line;
  }
  return undefined;
}

async function runTidekeeperStatus(): Promise<TidalToolDiagnostic> {
  const configPath = tidalConfigPath();
  const [versionCommand, doctorResult, helpResult, configExists] = await Promise.all([
    runCommand(tidalBinary(), ["--version"], STATUS_TIMEOUT_MS, undefined, {
      env: commandEnv(),
    }),
    runCommand(tidalBinary(), ["--doctor"], STATUS_TIMEOUT_MS, undefined, {
      env: commandEnv(),
    }),
    runCommand(tidalBinary(), ["--help"], STATUS_TIMEOUT_MS, undefined, {
      env: commandEnv(),
    }),
    fileExists(configPath),
  ]);
  const versionOutput = `${versionCommand.stdout}\n${versionCommand.stderr}`.trim();
  const doctor = `${doctorResult.stdout}\n${doctorResult.stderr}`.trim();
  const helpOutput = `${helpResult.stdout}\n${helpResult.stderr}`.trim();
  const doctorUnsupported = looksLikeCliUsage(doctor) && !doctorResult.ok;
  const incompatibleTiddl = looksLikeTiddlCli(`${versionOutput}\n${doctor}\n${helpOutput}`);
  const loggedIn = doctorLoggedIn(doctor, doctorResult.ok) || (configExists && doctorUnsupported);
  const toolAvailable = !incompatibleTiddl && (versionCommand.ok || doctorResult.ok || helpResult.ok || looksLikeCliUsage(versionOutput) || looksLikeCliUsage(doctor) || looksLikeCliUsage(helpOutput));
  const updateStatus = toolAvailable ? await runTidekeeperUpdateStatus(firstOutputLine(versionCommand.ok ? versionOutput : "", helpOutput, versionOutput, doctor)) : { updateAvailable: false };
  return {
    available: toolAvailable,
    version: firstOutputLine(versionCommand.ok ? versionOutput : "", helpOutput, versionOutput, doctor),
    error: incompatibleTiddl
      ? "TIDAL_DL_NG_PATH points to the incompatible tiddl CLI. Set it to tidekeeper.exe and restart the dev server."
      : toolAvailable
        ? (loggedIn ? undefined : doctor || "TIDAL token is not valid. Run `tidekeeper login`.")
        : (versionOutput || doctor || helpOutput || "tidekeeper is unavailable."),
    errorCode: incompatibleTiddl ? "INCOMPATIBLE_TIDDL" : toolAvailable ? (loggedIn ? undefined : doctorResult.errorCode) : (versionCommand.errorCode || doctorResult.errorCode || helpResult.errorCode),
    configPath,
    configExists,
    loggedIn: !incompatibleTiddl && loggedIn,
    doctor: doctor.slice(0, 4000) || undefined,
    updateAvailable: updateStatus.updateAvailable,
    latestVersion: updateStatus.latestVersion,
  };
}

function parseVersionNumber(value: string | undefined): string | undefined {
  return value?.match(/\d+(?:\.\d+){1,3}/)?.[0];
}

function compareVersions(left: string, right: string): number {
  const a = left.split(".").map((part) => Number(part) || 0);
  const b = right.split(".").map((part) => Number(part) || 0);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

async function runTidekeeperUpdateStatus(currentVersionOutput?: string): Promise<{ updateAvailable: boolean; latestVersion?: string }> {
  if (updateStatusCache && Date.now() - updateStatusCache.checkedAt < UPDATE_CACHE_MS) {
    return { updateAvailable: updateStatusCache.updateAvailable, latestVersion: updateStatusCache.latestVersion };
  }

  const updateCheck = await runCommand(tidalBinary(), ["--update-check"], STATUS_TIMEOUT_MS, undefined, {
    env: commandEnv(),
  });
  const updateOutput = `${updateCheck.stdout}\n${updateCheck.stderr}`.trim();
  const currentVersion = parseVersionNumber(currentVersionOutput);
  const latestFromCli = updateOutput.match(/latest(?:\s+version)?[:=\s]+v?(\d+(?:\.\d+){1,3})/i)?.[1]
    || updateOutput.match(/update\s+available.*?v?(\d+(?:\.\d+){1,3})/i)?.[1];
  if (latestFromCli) {
    updateStatusCache = {
      checkedAt: Date.now(),
      latestVersion: latestFromCli,
      updateAvailable: currentVersion ? compareVersions(latestFromCli, currentVersion) > 0 : /update\s+available/i.test(updateOutput),
    };
    return { updateAvailable: updateStatusCache.updateAvailable, latestVersion: updateStatusCache.latestVersion };
  }

  const release = await fetchJsonWithTimeout<{ tag_name?: string; name?: string }>("https://api.github.com/repos/OpenNerdz/tidekeeper-cli/releases/latest", {
    headers: { "User-Agent": "Turrex/1.0 (private local audio library)" },
  });
  const latestVersion = parseVersionNumber(release?.tag_name || release?.name);
  updateStatusCache = {
    checkedAt: Date.now(),
    latestVersion,
    updateAvailable: Boolean(currentVersion && latestVersion && compareVersions(latestVersion, currentVersion) > 0),
  };
  return { updateAvailable: updateStatusCache.updateAvailable, latestVersion: updateStatusCache.latestVersion };
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function tokenCandidateFromJson(value: unknown, seen = new WeakSet<object>()): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  if (seen.has(value)) return undefined;
  seen.add(value);
  const record = value as Record<string, unknown>;
  for (const key of ["token", "accessToken", "access_token", "access-token", "bearer"]) {
    const raw = record[key];
    if (typeof raw === "string" && raw.trim().length > 20) {
      return raw.replace(/^Bearer\s+/i, "").trim();
    }
  }
  for (const [key, raw] of Object.entries(record)) {
    if (typeof raw === "string" && /access[_-]?token|bearer/i.test(key) && !/refresh/i.test(key) && raw.length > 20) {
      return raw.replace(/^Bearer\s+/i, "").trim();
    }
  }
  for (const raw of Object.values(record)) {
    const nested = tokenCandidateFromJson(raw, seen);
    if (nested) return nested;
  }
  return undefined;
}

function decodeBase64Text(value: string): string | undefined {
  const compact = value.trim().replace(/\s+/g, "").replace(/\.+$/, "");
  if (!compact || !/^[A-Za-z0-9_+/=-]+$/.test(compact)) return undefined;
  const normalized = compact.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  try {
    const decoded = Buffer.from(padded, "base64").toString("utf8").trim();
    return decoded.startsWith("{") || decoded.startsWith("[") ? decoded : undefined;
  } catch {
    return undefined;
  }
}

function parseJsonCandidate(value: string): unknown | undefined {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function expiryIsoFromValue(value: unknown, key: string): string | undefined {
  const lowerKey = key.toLowerCase();
  const numeric = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value.trim()) : Number.NaN;
  if (Number.isFinite(numeric) && numeric > 0) {
    const isDuration = lowerKey.includes("expiresin") || lowerKey.includes("expires_in") || lowerKey.includes("ttl");
    const timestampMs = isDuration
      ? Date.now() + numeric * 1000
      : numeric > 10_000_000_000
        ? numeric
        : numeric > 1_000_000_000
          ? numeric * 1000
          : Date.now() + numeric * 1000;
    return new Date(timestampMs).toISOString();
  }
  if (typeof value !== "string") return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
}

function tokenExpiryFromJson(value: unknown, seen = new WeakSet<object>()): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  if (seen.has(value)) return undefined;
  seen.add(value);
  const record = value as Record<string, unknown>;
  for (const [key, raw] of Object.entries(record)) {
    if (/refresh/i.test(key)) continue;
    if (/(expires|expiry|expiration|validuntil|valid_until|ttl)/i.test(key)) {
      const expiry = expiryIsoFromValue(raw, key);
      if (expiry) return expiry;
    }
  }
  for (const raw of Object.values(record)) {
    const nested = tokenExpiryFromJson(raw, seen);
    if (nested) return nested;
  }
  return undefined;
}

function tokenExpiryFromJwt(token: string): string | undefined {
  const [, payload] = token.split(".");
  if (!payload) return undefined;
  const decoded = decodeBase64Text(payload);
  if (!decoded) return undefined;
  const parsed = parseJsonCandidate(decoded);
  if (!parsed || typeof parsed !== "object") return undefined;
  const exp = (parsed as { exp?: unknown }).exp;
  return typeof exp === "number" && Number.isFinite(exp) && exp > 0 ? new Date(exp * 1000).toISOString() : undefined;
}

function tokenInfoFromRaw(raw: string): { value?: string; tokenExpiry?: string } {
  const candidates = [raw.trim(), decodeBase64Text(raw)].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    const parsed = parseJsonCandidate(candidate);
    if (!parsed) continue;
    const value = tokenCandidateFromJson(parsed);
    if (value) return { value, tokenExpiry: tokenExpiryFromJson(parsed) ?? tokenExpiryFromJwt(value) };
  }

  const match = raw.match(/(?:access[_-]?token|bearer|token)["'\s:=]+([A-Za-z0-9._~+/=-]{24,})/i);
  const value = match?.[1]?.replace(/^Bearer\s+/i, "").trim();
  if (value) return { value, tokenExpiry: tokenExpiryFromJwt(value) };

  const compact = raw.trim();
  if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(compact)) {
    return { value: compact, tokenExpiry: tokenExpiryFromJwt(compact) };
  }
  return {};
}

function clearCachedTidalToken() {
  cachedToken = null;
}

async function getTidalAccessToken(): Promise<string | null> {
  const now = Date.now();
  if (cachedToken && cachedToken.cacheExpiresAt > now) return cachedToken.value;

  const tokenPath = tidalConfigPath();
  lastTidalTokenError = null;
  const raw = await readFile(tokenPath, "utf8").catch((error: unknown) => {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") console.warn("[tidal-search] Could not read TIDAL token file.", { tokenPath, error: messageFromUnknown(error) });
    lastTidalTokenError = code === "ENOENT" ? "TIDAL token not found. Please log in." : "Could not read TIDAL token file.";
    return "";
  });
  if (!raw.trim()) return null;

  const tokenInfo = tokenInfoFromRaw(raw);
  const token = tokenInfo.value;
  if (!token) {
    lastTidalTokenError = "TIDAL token file could not be parsed. Please log in again.";
    console.warn("[tidal-search] Could not find an access token in the TIDAL token file.", { tokenPath });
    return null;
  }

  const tokenExpiryTime = tokenInfo.tokenExpiry ? Date.parse(tokenInfo.tokenExpiry) : Number.NaN;
  if (Number.isFinite(tokenExpiryTime) && tokenExpiryTime <= now + 5000) {
    cachedToken = null;
    lastTidalTokenError = "Token expired. Please log in again.";
    return null;
  }

  cachedToken = {
    value: token,
    tokenExpiry: tokenInfo.tokenExpiry,
    cacheExpiresAt: Number.isFinite(tokenExpiryTime)
      ? Math.min(now + TIDAL_TOKEN_CACHE_MS, Math.max(now, tokenExpiryTime - 5000))
      : now + TIDAL_TOKEN_CACHE_MS,
  };
  return token;
}

type TidalSearchResponse = {
  data?: unknown;
  included?: unknown;
};

type TidalSearchResult = {
  success: true;
  url?: string;
} | {
  success: false;
  error: string;
  status: number;
  retryAfter?: number;
};

function tidalTrackIdFromSearch(value: unknown, seen = new WeakSet<object>()): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  if (seen.has(value)) return undefined;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const entry of value) {
      const id = tidalTrackIdFromSearch(entry, seen);
      if (id) return id;
    }
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const type = `${stringField(record.type)} ${stringField(record.resourceType)} ${stringField(record.contentType)}`.toLowerCase();
  const id = typeof record.id === "number" ? String(record.id) : stringField(record.id);
  if (id && (type.includes("track") || typeof record.duration === "number" || typeof record.durationMs === "number")) {
    return id;
  }
  for (const nested of Object.values(record)) {
    const nestedId = tidalTrackIdFromSearch(nested, seen);
    if (nestedId) return nestedId;
  }
  return undefined;
}

function decodeSearchQuery(value: string): string {
  try {
    return decodeURIComponent(value).trim();
  } catch {
    return value.trim();
  }
}

function retryAfterSeconds(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return Math.ceil(numeric);
  const dateValue = Date.parse(value);
  if (!Number.isNaN(dateValue)) return Math.max(1, Math.ceil((dateValue - Date.now()) / 1000));
  return fallback;
}

function rateLimitRetryAfter(now: number): number {
  const oldest = searchRequestTimestamps[0];
  if (typeof oldest !== "number") return 30;
  return Math.max(1, Math.ceil((TIDAL_SEARCH_WINDOW_MS - (now - oldest)) / 1000));
}

function tidalSearchRateLimitRemaining(now = Date.now()): number {
  searchRequestTimestamps = searchRequestTimestamps.filter((timestamp) => now - timestamp < TIDAL_SEARCH_WINDOW_MS);
  return Math.max(0, TIDAL_SEARCH_MAX_REQUESTS - searchRequestTimestamps.length);
}

async function reserveTidalSearchSlot(): Promise<TidalSearchResult | null> {
  const previous = searchRateLimiterQueue;
  let releaseQueue: () => void = () => undefined;
  searchRateLimiterQueue = new Promise<void>((resolve) => {
    releaseQueue = resolve;
  });
  await previous;

  try {
    let now = Date.now();
    searchRequestTimestamps = searchRequestTimestamps.filter((timestamp) => now - timestamp < TIDAL_SEARCH_WINDOW_MS);
    if (searchRequestTimestamps.length >= TIDAL_SEARCH_MAX_REQUESTS) {
      return {
        success: false,
        error: "Too many search requests. Please wait 30 seconds.",
        status: 429,
        retryAfter: rateLimitRetryAfter(now),
      };
    }

    const delayMs = Math.max(0, TIDAL_SEARCH_MIN_INTERVAL_MS - (now - lastTidalSearchRequestAt));
    if (delayMs > 0) await sleep(delayMs);

    now = Date.now();
    searchRequestTimestamps = searchRequestTimestamps.filter((timestamp) => now - timestamp < TIDAL_SEARCH_WINDOW_MS);
    if (searchRequestTimestamps.length >= TIDAL_SEARCH_MAX_REQUESTS) {
      return {
        success: false,
        error: "Too many search requests. Please wait 30 seconds.",
        status: 429,
        retryAfter: rateLimitRetryAfter(now),
      };
    }

    searchRequestTimestamps.push(now);
    lastTidalSearchRequestAt = now;
    return null;
  } finally {
    releaseQueue();
  }
}

function tidalTrackUrlFromSearchPayload(payload: TidalSearchResponse | null): string | undefined {
  const data = payload?.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const tracks = (data as { tracks?: unknown }).tracks;
    if (Array.isArray(tracks)) {
      const first = tracks[0];
      if (first && typeof first === "object") {
        const id = typeof (first as { id?: unknown }).id === "number"
          ? String((first as { id: number }).id)
          : stringField((first as { id?: unknown }).id);
        if (id) return `https://tidal.com/track/${encodeURIComponent(id)}`;
      }
    }
  }
  const fallbackId = tidalTrackIdFromSearch(payload);
  return fallbackId ? `https://tidal.com/track/${encodeURIComponent(fallbackId)}` : undefined;
}

async function fetchTidalSearch(query: string, token: string): Promise<{ response: Response; payload: TidalSearchResponse | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIDAL_SEARCH_TIMEOUT_MS);
  try {
    const url = `https://api.tidal.com/v2/search?query=${encodeURIComponent(query)}&type=TRACKS&limit=3&countryCode=BG`;
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "User-Agent": "Turrex/1.0 (private local audio library)",
      },
    });
    const payload = await response.json().catch(() => null) as TidalSearchResponse | null;
    return { response, payload };
  } finally {
    clearTimeout(timer);
  }
}

async function performTidalSearch(query: string): Promise<TidalSearchResult> {
  const token = await getTidalAccessToken();
  if (!token) {
    return { success: false, error: lastTidalTokenError || "TIDAL token not found. Please log in.", status: 401 };
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const rateLimitResult = await reserveTidalSearchSlot();
    if (rateLimitResult) return rateLimitResult;

    try {
      const { response, payload } = await fetchTidalSearch(query, token);
      if (response.status === 200) {
        const url = tidalTrackUrlFromSearchPayload(payload);
        return url ? { success: true, url } : { success: false, error: "Not found", status: 200 };
      }
      if (response.status === 401) {
        clearCachedTidalToken();
        lastTidalTokenError = "Token expired. Please log in again.";
        return { success: false, error: "Token expired. Please log in again.", status: 401 };
      }
      if (response.status === 429) {
        const retryAfter = retryAfterSeconds(response.headers.get("retry-after"), attempt + 1);
        if (attempt < 2) {
          await sleep(Math.min(retryAfter, attempt + 1) * 1000);
          continue;
        }
        return {
          success: false,
          error: "Rate limited by TIDAL. Please wait.",
          status: 429,
          retryAfter,
        };
      }
      if (response.status >= 500) {
        if (attempt < 2) {
          await sleep((attempt + 1) * 1000);
          continue;
        }
        return { success: false, error: "TIDAL API error.", status: 502 };
      }
      return { success: false, error: "TIDAL search failed.", status: response.status || 502 };
    } catch (error) {
      console.warn("[tidal-search] Search request failed.", { attempt: attempt + 1, query, error: messageFromUnknown(error) });
      if (attempt < 2) {
        await sleep((attempt + 1) * 1000);
        continue;
      }
      return { success: false, error: "TIDAL API error.", status: 502 };
    }
  }

  return { success: false, error: "TIDAL API error.", status: 502 };
}

async function searchTidalTrackUrl(query: string): Promise<string | undefined> {
  const result = await performTidalSearch(query);
  if (result.success) return result.url;
  if (result.status === 401) throw new DownloaderError(result.error, 401);
  if (result.status === 429) throw new DownloaderError(result.error, 429, { retryAfter: result.retryAfter });
  return undefined;
}

async function handleSearch(query: string | null): Promise<Response> {
  const q = query ? decodeSearchQuery(query) : "";
  if (!q) return NextResponse.json({ success: false, error: "Missing search query." }, { status: 400 });
  try {
    const result = await performTidalSearch(q);
    if (result.success) return NextResponse.json({ success: true, url: result.url });
    const headers = new Headers();
    if (result.retryAfter) headers.set("Retry-After", String(result.retryAfter));
    return NextResponse.json(
      { success: false, error: result.error, retryAfter: result.retryAfter },
      { status: result.status, headers },
    );
  } catch (error) {
    console.error("[tidal-search] Search failed unexpectedly.", error);
    return NextResponse.json({ success: false, error: "Search failed unexpectedly." }, { status: 500 });
  }
}

async function checkTempWritable(dir: string): Promise<boolean> {
  const probeDir = await mkdtemp(path.join(dir, "turrex-tidal-status-"));
  try {
    await writeFile(path.join(probeDir, "probe.txt"), "ok");
    return true;
  } catch {
    return false;
  } finally {
    await rm(probeDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function sanitizeFileName(input: string): string {
  const cleaned = input
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
  return cleaned || "Turrex TIDAL Track";
}

function safeTemplateValue(value: string | undefined, fallback = ""): string {
  return (value || fallback).replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();
}

function fileNameFromTemplate(template: string, metadata: AudioMetadata, profile: ProfileDescriptor, trackNumber: number, preview: boolean): string {
  const normalizedTemplate = template.trim() || "{artist} - {title}.{ext}";
  const replacements: Record<string, string> = {
    artist: safeTemplateValue(metadata.artist, "Unknown Artist"),
    title: safeTemplateValue(metadata.title, "Unknown Title"),
    album: safeTemplateValue(metadata.album, DEFAULT_ALBUM),
    year: safeTemplateValue(metadata.year),
    quality: profile.bitrate,
    profile: profile.id,
    tracknumber: String(trackNumber).padStart(2, "0"),
    ext: profile.extension,
  };
  const rendered = normalizedTemplate.replace(/\{(artist|title|album|year|quality|profile|tracknumber|ext)\}/gi, (_match, key: string) => replacements[key.toLowerCase()] ?? "");
  let safe = rendered.replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
  if (!safe || safe === "." || safe.endsWith(".")) {
    safe = `${replacements.artist} - ${replacements.title}.${profile.extension}`;
  }
  if (!safe.toLowerCase().endsWith(`.${profile.extension}`)) {
    safe = `${safe.replace(/\.[^.]+$/, "")}.${profile.extension}`;
  }
  if (preview && !safe.toLowerCase().startsWith("preview_")) safe = `preview_${safe}`;
  return safe.slice(0, 200);
}

function postActionFromUnknown(value: unknown): "openFolder" | "notify" | "moveToLibrary" | undefined {
  return value === "openFolder" || value === "notify" || value === "moveToLibrary" ? value : undefined;
}

function expandPostCommand(command: string, zipPath: string): string {
  return command.replaceAll("{zip}", zipPath);
}

function runExecCommand(command: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    exec(command, { timeout: timeoutMs, windowsHide: true }, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function runAllowedPostCommand(command: string, zipPath: string): Promise<void> {
  const allowed = (process.env.TIDAL_POST_COMMAND_ALLOWED || "")
    .split("|")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (allowed.length === 0) throw new DownloaderError("Post command was requested, but TIDAL_POST_COMMAND_ALLOWED is empty.", 400);
  const expandedCommand = expandPostCommand(command.trim(), zipPath);
  const match = allowed.some((entry) => expandPostCommand(entry, zipPath) === expandedCommand);
  if (!match) throw new DownloaderError("Post command is not registered in TIDAL_POST_COMMAND_ALLOWED.", 403);
  await runExecCommand(expandedCommand, 30000);
}

function safeZipPath(input: string): string {
  const normalized = input.replace(/\\/g, "/").split("/").filter(Boolean).join("/");
  if (!normalized || /^[a-zA-Z]:/.test(normalized) || normalized.startsWith("/") || normalized.split("/").some((part) => part === "..") || normalized.includes("\u0000")) {
    throw new Error("Unsafe ZIP entry path.");
  }
  return normalized;
}

function getUniqueFileName(fileName: string, used: Set<string>): string {
  const ext = path.extname(fileName);
  const stem = sanitizeFileName(path.basename(fileName, ext));
  let candidate = `${stem}${ext}`;
  let index = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${stem} (${index})${ext}`;
    index += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

async function getAudioFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true }).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...await getAudioFiles(fullPath));
      continue;
    }
    if (entry.isFile() && AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      results.push(fullPath);
    }
  }
  return results;
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

async function resizeCoverArt(coverPath: string, tempDir: string): Promise<string> {
  const outputPath = path.join(tempDir, "cover-resized.jpg");
  const result = await runCommand(ffmpegBinary(), [
    "-hide_banner",
    "-nostdin",
    "-y",
    "-i", coverPath,
    "-vf", "scale=1200:1200:force_original_aspect_ratio=decrease",
    "-frames:v", "1",
    "-q:v", "3",
    outputPath,
  ], STATUS_TIMEOUT_MS);
  if (!result.ok) return coverPath;
  const outputStats = await stat(outputPath).catch(() => null);
  return outputStats && outputStats.size > 0 ? outputPath : coverPath;
}

function buildLoudnormFilter(): string[] {
  return ["loudnorm=I=-16:LRA=11:TP=-1.5"];
}

function buildTrimSilenceFilters(): string[] {
  return [
    "silenceremove=start_periods=1:start_duration=1:start_threshold=-50dB",
    "areverse",
    "silenceremove=start_periods=1:start_duration=1:start_threshold=-50dB",
    "areverse",
  ];
}

function buildFadeFilters(durationSec?: number): string[] {
  const filters = ["afade=t=in:curve=tri:duration=1"];
  if (typeof durationSec === "number" && durationSec > 1.5) {
    filters.push(`afade=t=out:curve=tri:start_time=${Math.max(0, durationSec - 1).toFixed(3)}:duration=1`);
  } else {
    filters.push("afade=t=out:curve=tri:duration=1");
  }
  return filters;
}

function buildFilterChain(profile: ProfileDescriptor, enhancements: TidalEnhancements, durationSec?: number): string[] {
  const truePeakLimiter = enhancements.truePeakLimiter ?? profile.truePeakLimiter;
  const stereoEnhance = enhancements.stereoEnhance ?? profile.stereoEnhance;
  const filters: string[] = [];
  if (enhancements.loudnorm || profile.loudnorm) filters.push(...buildLoudnormFilter());
  if (enhancements.trimSilence) filters.push(...buildTrimSilenceFilters());
  if (truePeakLimiter) filters.push("alimiter=limit=0.891:attack=5:release=50:level=disabled");
  if (stereoEnhance) filters.push("stereotools=mode=lr>ms:ms_lr_balance=0.25,stereotools=mode=ms>lr");
  if (enhancements.fadeInOut) filters.push(...buildFadeFilters(durationSec));
  return filters;
}

function metadataArgs(metadata: AudioMetadata, enabled: boolean): string[] {
  if (!enabled) return [];
  const safe = (value: string) => value.replace(/\u0000/g, "").slice(0, 12000);
  const args = [
    "-metadata", `title=${safe(metadata.title || "Unknown Title")}`,
    "-metadata", `artist=${safe(metadata.artist || "Unknown Artist")}`,
    "-metadata", `album=${safe(metadata.album || DEFAULT_ALBUM)}`,
    "-metadata", "comment=Turrex TIDAL Export",
    "-metadata", "encoded_by=Turrex",
  ];
  if (metadata.year) args.push("-metadata", `date=${safe(metadata.year)}`);
  if (metadata.genre) args.push("-metadata", `genre=${safe(metadata.genre)}`);
  if (metadata.lyrics) args.push("-metadata", `lyrics=${safe(metadata.lyrics)}`);
  if (metadata.releaseMbid) args.push("-metadata", `MUSICBRAINZ_ALBUMID=${safe(metadata.releaseMbid)}`);
  return args;
}

function buildFfmpegArgs(profile: ProfileDescriptor, input: string, output: string, options: {
  coverPath?: string;
  metadata: AudioMetadata;
  sourceCodec?: string;
  durationSec?: number;
  enhancements: TidalEnhancements;
  preview: boolean;
}): string[] {
  const embedMetadata = options.enhancements.embedMetadata ?? profile.metadata;
  const embedCover = Boolean(options.coverPath && (options.enhancements.embedCover ?? profile.cover));
  const filters = buildFilterChain(profile, options.enhancements, options.durationSec);
  const sourceCodec = (options.sourceCodec || "").toLowerCase();
  const canCopyFlac = profile.id === "audiophile-flac" && sourceCodec === "flac" && !options.preview && filters.length === 0;
  const args = ["-hide_banner", "-nostdin", "-y"];

  if (options.preview) args.push("-ss", "0", "-t", "30");
  args.push("-i", input);
  if (options.coverPath && embedCover) args.push("-i", options.coverPath);

  if (canCopyFlac && !options.coverPath) {
    args.push("-map", "0", "-c", "copy");
  } else {
    args.push("-map", "0:a:0");
    if (options.coverPath && embedCover) {
      args.push("-map", "1:v:0", "-disposition:v:0", "attached_pic", "-c:v", "copy", "-metadata:s:v", "title=Album cover", "-metadata:s:v", "comment=Cover (front)");
    } else if (embedCover) {
      args.push("-map", "0:v:0?", "-disposition:v:0", "attached_pic");
    }
    if (filters.length > 0) args.push("-af", filters.join(","));
    if (profile.id === "audiophile-flac" && !canCopyFlac) {
      args.push("-c:a", "flac", "-compression_level", "8");
    } else {
      args.push(...profile.codecArgs);
    }
  }

  args.push(...metadataArgs(options.metadata, embedMetadata));
  args.push(output);
  return args;
}

async function runFfmpeg(profile: ProfileDescriptor, inputPath: string, outputPath: string, options: {
  coverPath?: string;
  metadata: AudioMetadata;
  sourceCodec?: string;
  durationSec?: number;
  enhancements: TidalEnhancements;
  preview: boolean;
}): Promise<void> {
  const result = await runCommand(ffmpegBinary(), buildFfmpegArgs(profile, inputPath, outputPath, options), FFMPEG_TIMEOUT_MS);
  if (!result.ok) {
    const detail = `${result.stderr || result.stdout || "ffmpeg failed."}`.replace(/\s+/g, " ").trim();
    throw new Error(`Transcoding failed: ${detail.slice(0, 1600)}`);
  }
  const outputStats = await stat(outputPath).catch(() => null);
  if (!outputStats || outputStats.size === 0) throw new Error("Transcoding completed without a usable output file.");
}

function parseRetryAfter(output: string): number | undefined {
  const explicit = output.match(/retry(?:\s|-)?after[:=\s]+(\d+)/i)?.[1] || output.match(/try again in\s+(\d+)\s*(seconds?|minutes?)/i)?.[1];
  if (!explicit) return undefined;
  const amount = Number(explicit);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  const unit = output.match(/try again in\s+\d+\s*(minutes?)/i)?.[1];
  return Math.min(Math.round(unit ? amount * 60 : amount), 24 * 60 * 60);
}

function parseTokenExpiry(output: string): string | undefined {
  const match = output.match(/good\s+for\s+(\d+(?:\.\d+)?)\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)/i);
  if (!match) return undefined;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  const unit = match[2]!.toLowerCase();
  const multiplier = unit.startsWith("hour") || unit.startsWith("hr") ? 3600 : unit.startsWith("min") ? 60 : 1;
  return new Date(Date.now() + amount * multiplier * 1000).toISOString();
}

async function handleLogin(): Promise<Response> {
  try {
    clearCachedTidalToken();
    const child = spawn(tidalBinary(), ["login"], {
      shell: false,
      stdio: "ignore",
      windowsHide: true,
      detached: true,
      env: commandEnv(process.env.TIDAL_PROXY),
    });
    await new Promise<void>((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", reject);
    });
    child.unref();
    return NextResponse.json({
      success: true,
      message: "Browser opened. Complete login and the token will be refreshed.",
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: messageFromUnknown(error) || "Could not start tidekeeper login.",
    }, { status: 500 });
  }
}

function classifyDownloaderFailure(output: string, fallbackMessage: string): DownloaderError {
  const lower = output.toLowerCase();
  if (lower.includes("429") || lower.includes("rate limit") || lower.includes("too many requests")) {
    return new DownloaderError("TIDAL rate limited this request. Turrex will retry after the cooldown.", 429, {
      retryAfter: parseRetryAfter(output) ?? 30 * 60,
      detail: output.slice(0, 1800),
    });
  }
  if (lower.includes("401") || lower.includes("unauthorized") || lower.includes("not logged in") || lower.includes("token expired") || lower.includes("expired token") || lower.includes("login") || lower.includes("session") || lower.includes("auth")) {
    return new DownloaderError("TIDAL authorization failed. Run `tidekeeper login` locally, then retry.", 401, { detail: output.slice(0, 1800) });
  }
  return new DownloaderError(`${fallbackMessage}: ${(output || "No error output.").slice(0, 1800)}`, 500, { detail: output.slice(0, 1800) });
}

async function runTidalInfo(url: string): Promise<{ metadata?: Partial<AudioMetadata>; output: string; ok: boolean }> {
  const result = await runCommand(tidalBinary(), ["info", url], INFO_TIMEOUT_MS, undefined, {
    env: commandEnv(process.env.TIDAL_PROXY),
  });
  const output = `${result.stdout}\n${result.stderr}`.trim();
  return { metadata: parseTidalInfoOutput(output), output, ok: result.ok };
}

function parseTidalInfoOutput(output: string): Partial<AudioMetadata> {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const find = (keys: string[]): string | undefined => {
    for (const line of lines) {
      const match = line.match(/^([^:=]+)\s*[:=]\s*(.+)$/);
      if (!match) continue;
      const key = match[1]!.trim().toLowerCase();
      if (keys.some((candidate) => key.includes(candidate))) return match[2]!.trim();
    }
    return undefined;
  };
  return {
    artist: find(["artist", "artists", "performer"]),
    title: find(["title", "track", "name"]),
    album: find(["album"]),
    year: find(["year", "date", "release"]),
  };
}

function summarizeTidalDownloadFailures(failures: TidalDownloadAttemptFailure[], limit = 1000): string {
  const combined = failures
    .map((failure) => {
      const output = [failure.stderr, failure.stdout].map((value) => value.trim()).filter(Boolean).join("\n");
      return [
        `[${failure.quality}] exit=${failure.exitCode ?? "unknown"} files=${failure.filesFound}`,
        output || "no stdout/stderr",
      ].join("\n");
    })
    .join("\n\n");
  return (combined || "no tidekeeper output").slice(0, limit);
}

async function runTidalDownload(url: string, outputDir: string): Promise<{ stdout: string; stderr: string }> {
  const absoluteOutputDir = path.resolve(outputDir);
  const tidekeeperDownloadDir = path.join(absoluteOutputDir, "download");
  const proxy = process.env.TIDAL_PROXY?.trim();
  const failures: TidalDownloadAttemptFailure[] = [];

  for (let index = 0; index < TIDAL_DOWNLOAD_QUALITIES.length; index += 1) {
    const quality = TIDAL_DOWNLOAD_QUALITIES[index]!;
    await rm(absoluteOutputDir, { recursive: true, force: true }).catch(() => undefined);
    await mkdir(absoluteOutputDir, { recursive: true });

    const args = ["-l", url, "-q", quality];
    const argsWithProxy = proxy ? [...args, "--proxy", proxy] : args;
    console.warn("[tidal-download] Starting tidekeeper quality attempt.", { quality, cwd: absoluteOutputDir, downloadDir: tidekeeperDownloadDir });
    const result = await runCommand(tidalBinary(), argsWithProxy, TIDAL_TIMEOUT_MS, absoluteOutputDir, {
      env: commandEnv(proxy),
    });
    const retryWithoutProxy = proxy && !result.ok && /no such option ['"]?--proxy|unknown option ['"]?--proxy/i.test(`${result.stderr}\n${result.stdout}`);
    const finalResult = retryWithoutProxy
      ? await runCommand(tidalBinary(), args, TIDAL_TIMEOUT_MS, absoluteOutputDir, { env: commandEnv(proxy) })
      : result;
    const output = `${finalResult.stderr}\n${finalResult.stdout}`.trim();
    const files = await getAudioFiles(tidekeeperDownloadDir);

    if (finalResult.ok && files.length > 0) {
      console.warn("[tidal-download] tidekeeper produced audio files.", { quality, filesFound: files.length });
      return { stdout: finalResult.stdout, stderr: finalResult.stderr };
    }

    failures.push({
      quality,
      exitCode: finalResult.code,
      stderr: finalResult.stderr.slice(-4000),
      stdout: finalResult.stdout.slice(-4000),
      filesFound: files.length,
    });
    console.warn("[tidal-download] tidekeeper quality attempt did not produce usable audio.", {
      quality,
      ok: finalResult.ok,
      code: finalResult.code,
      errorCode: finalResult.errorCode,
      filesFound: files.length,
      stderr: finalResult.stderr.slice(-1200),
    });

    if (!finalResult.ok) {
      if (finalResult.errorCode === "ENOENT" || output.toLowerCase().includes("not recognized")) {
        throw new DownloaderError("tidekeeper is not installed or TIDAL_DL_NG_PATH is not configured.", 500, { detail: output });
      }
      if (looksLikeTiddlCli(output) && /no such option ['"]?-l/i.test(output)) {
        throw new DownloaderError("TIDAL_DL_NG_PATH points to tiddl.exe, which is not the tested tidekeeper CLI. Set TIDAL_DL_NG_PATH to C:\\tidal-tools\\venv\\Scripts\\tidekeeper.exe and restart the dev server.", 500, { detail: output.slice(0, 2200) });
      }
      const failure = classifyDownloaderFailure(output, "TIDAL download failed");
      if (failure.status === 401 || failure.status === 429) throw failure;
    }

    if (index < TIDAL_DOWNLOAD_QUALITIES.length - 1) await sleep(1000);
  }

  await rm(absoluteOutputDir, { recursive: true, force: true }).catch(() => undefined);
  await mkdir(absoluteOutputDir, { recursive: true }).catch(() => undefined);
  const qualities = TIDAL_DOWNLOAD_QUALITIES.join(", ");
  const tidekeeperOutput = summarizeTidalDownloadFailures(failures);
  throw new DownloaderError(`TIDAL did not produce any audio files after trying qualities ${qualities}. tidekeeper output: ${tidekeeperOutput}`, 500, {
    detail: JSON.stringify({ qualitiesTried: failures }, null, 2).slice(0, 4000),
  });
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll("\"", "\"\"")}"` : value;
}

async function runSoulseekFallback(metadata: AudioMetadata, csvPath: string, outputDir: string): Promise<{ stdout: string; stderr: string }> {
  await writeFile(csvPath, `${csvCell(metadata.artist)},${csvCell(metadata.title)}\n`, "utf8");
  const args = ["--csv", csvPath, "--output-dir", outputDir, "--format", "flac", "--bitrate", "320", "--verbose"];
  const proxy = process.env.SLSK_PROXY?.trim();
  const result = await runCommand(soulseekBinary(), proxy ? [...args, "--proxy", proxy] : args, SLSK_TIMEOUT_MS, undefined, {
    env: commandEnv(proxy),
  });
  const retryWithoutProxy = proxy && !result.ok && /no such option ['"]?--proxy|unknown option ['"]?--proxy/i.test(`${result.stderr}\n${result.stdout}`);
  const finalResult = retryWithoutProxy
    ? await runCommand(soulseekBinary(), args, SLSK_TIMEOUT_MS, undefined, { env: commandEnv(proxy) })
    : result;
  const output = `${finalResult.stderr}\n${finalResult.stdout}`.trim();
  if (!finalResult.ok) {
    if (finalResult.errorCode === "ENOENT" || output.toLowerCase().includes("not recognized")) {
      throw new DownloaderError("slsk-batchdl is not installed or SLSK_BATCHDL_PATH is not configured.", 500, { detail: output });
    }
    throw new DownloaderError(`Soulseek fallback failed: ${(output || "No error output.").slice(0, 1800)}`, 500, { detail: output.slice(0, 1800) });
  }
  return { stdout: finalResult.stdout, stderr: finalResult.stderr };
}

function metadataFromUrl(url: string): AudioMetadata {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const id = segments.at(-1) || "TIDAL Link";
    const kind = classifyTidalUrl(url);
    return {
      artist: "",
      title: `${kind[0]?.toUpperCase() ?? "T"}${kind.slice(1)} ${id.slice(0, 12)}`,
      album: DEFAULT_ALBUM,
    };
  } catch {
    return { artist: "", title: "TIDAL Link", album: DEFAULT_ALBUM };
  }
}

function mergeMetadata(primary: Partial<AudioMetadata> | undefined, fallback: Partial<AudioMetadata>): AudioMetadata {
  return {
    artist: (primary?.artist || fallback.artist || "").trim(),
    title: (primary?.title || fallback.title || "Unknown Title").trim(),
    album: (primary?.album || fallback.album || DEFAULT_ALBUM).trim(),
    year: (primary?.year || fallback.year || "").trim() || undefined,
    genre: (primary?.genre || fallback.genre || "").trim() || undefined,
    lyrics: (primary?.lyrics || fallback.lyrics || "").trim() || undefined,
    releaseMbid: (primary?.releaseMbid || fallback.releaseMbid || "").trim() || undefined,
  };
}

async function probeAudio(filePath: string): Promise<{ codec?: string; bitrateKbps?: number; durationSec?: number; sampleRate?: number; channels?: number; tags?: Partial<AudioMetadata> }> {
  const result = await runCommand(ffprobeBinary(), [
    "-v", "error",
    "-show_entries", "stream=codec_name,bit_rate,sample_rate,channels:format=bit_rate,duration:format_tags=artist,title,album,date,genre,lyrics",
    "-of", "json",
    filePath,
  ], STATUS_TIMEOUT_MS);
  if (!result.ok || !result.stdout.trim()) return {};
  try {
    const parsed = JSON.parse(result.stdout) as {
      streams?: Array<{ codec_name?: string; bit_rate?: string; sample_rate?: string; channels?: number }>;
      format?: { bit_rate?: string; duration?: string; tags?: Record<string, string> };
    };
    const stream = parsed.streams?.[0];
    const streamBitrate = Number(stream?.bit_rate);
    const formatBitrate = Number(parsed.format?.bit_rate);
    const duration = Number(parsed.format?.duration);
    const sampleRate = Number(stream?.sample_rate);
    const channels = Number(stream?.channels);
    const bitRate = Number.isFinite(streamBitrate) && streamBitrate > 0 ? streamBitrate : formatBitrate;
    const tags = parsed.format?.tags ?? {};
    return {
      codec: stream?.codec_name,
      bitrateKbps: Number.isFinite(bitRate) && bitRate > 0 ? Math.round(bitRate / 1000) : undefined,
      durationSec: Number.isFinite(duration) && duration > 0 ? duration : undefined,
      sampleRate: Number.isFinite(sampleRate) && sampleRate > 0 ? sampleRate : undefined,
      channels: Number.isFinite(channels) && channels > 0 ? channels : undefined,
      tags: {
        artist: tags.artist,
        title: tags.title,
        album: tags.album,
        year: tags.date,
        genre: tags.genre,
        lyrics: tags.lyrics,
        releaseMbid: tags.MUSICBRAINZ_ALBUMID || tags.musicbrainz_albumid || tags.MusicBrainz_AlbumId,
      },
    };
  } catch {
    return {};
  }
}

function metadataFromFileName(filePath: string, fallback: AudioMetadata): AudioMetadata {
  const stem = path.basename(filePath, path.extname(filePath)).replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  const [left, ...rest] = stem.split(/\s+-\s+/);
  if (rest.length > 0) {
    return mergeMetadata({ artist: left, title: rest.join(" - "), album: fallback.album, year: fallback.year }, fallback);
  }
  return mergeMetadata({ title: stem }, fallback);
}

async function sourceFilesFromDirectory(dir: string, fallbackMetadata: AudioMetadata, source: DownloadSource): Promise<SourceAudioFile[]> {
  const files = await getAudioFiles(dir);
  const results: SourceAudioFile[] = [];
  for (const filePath of files) {
    const probe = await probeAudio(filePath);
    const metadata = mergeMetadata(probe.tags, metadataFromFileName(filePath, fallbackMetadata));
    const extension = path.extname(filePath).toLowerCase();
    const codec = probe.codec?.toLowerCase();
    if (source === "soulseek") {
      if (codec === "mp3" && extension === ".flac") {
        continue;
      }
      if (codec === "flac" && typeof probe.bitrateKbps === "number" && probe.bitrateKbps < 500) {
        continue;
      }
    }
    const fileStats = await stat(filePath).catch(() => null);
    results.push({
      filePath,
      metadata,
      codec,
      bitrateKbps: probe.bitrateKbps,
      durationSec: probe.durationSec,
      sampleRate: probe.sampleRate,
      channels: probe.channels,
      sizeBytes: fileStats?.size,
    });
  }
  return results;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJsonWithTimeout<T>(url: string, options?: RequestInit): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EXTERNAL_API_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, cache: "no-store" });
    if (!response.ok) return null;
    return await response.json() as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function checkServiceAvailable(cacheKey: string, url: string, options?: RequestInit): Promise<boolean> {
  const cached = serviceStatusCache.get(cacheKey);
  if (cached && Date.now() - cached.checkedAt < EXTERNAL_SERVICE_CACHE_MS) return cached.available;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EXTERNAL_API_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, method: "GET", signal: controller.signal, cache: "no-store" });
    const available = response.ok || response.status === 404;
    serviceStatusCache.set(cacheKey, { checkedAt: Date.now(), available });
    return available;
  } catch {
    serviceStatusCache.set(cacheKey, { checkedAt: Date.now(), available: false });
    return false;
  } finally {
    clearTimeout(timer);
  }
}

type MusicBrainzRecordingResponse = {
  recordings?: Array<{
    title?: string;
    date?: string;
    tags?: Array<{ name?: string; count?: number }>;
    releases?: Array<{ id?: string; title?: string; date?: string }>;
  }>;
};

async function fetchMusicBrainzMetadata(metadata: AudioMetadata): Promise<Partial<AudioMetadata>> {
  if (!metadata.artist || !metadata.title) return {};
  const query = `artist:${metadata.artist} recording:${metadata.title}`;
  const url = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query)}&fmt=json&limit=1`;
  const payload = await fetchJsonWithTimeout<MusicBrainzRecordingResponse>(url, {
    headers: { "User-Agent": "Turrex/1.0 (private local audio library)" },
  });
  const recording = payload?.recordings?.[0];
  if (!recording) return {};
  const release = recording.releases?.find((item) => item.title || item.date) ?? recording.releases?.[0];
  const tags = (recording.tags ?? [])
    .filter((tag) => tag.name)
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
    .slice(0, 3)
    .map((tag) => tag.name!.trim())
    .filter(Boolean);
  return {
    album: release?.title || metadata.album,
    year: (release?.date || recording.date || metadata.year || "").slice(0, 4) || undefined,
    genre: tags.length > 0 ? tags.join("; ") : metadata.genre,
    releaseMbid: release?.id || metadata.releaseMbid,
  };
}

type LyricsOvhResponse = { lyrics?: string };

async function fetchLyrics(metadata: AudioMetadata): Promise<string | undefined> {
  if (!metadata.artist || !metadata.title) return undefined;
  const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(metadata.artist)}/${encodeURIComponent(metadata.title)}`;
  const payload = await fetchJsonWithTimeout<LyricsOvhResponse>(url);
  const lyrics = payload?.lyrics?.trim();
  return lyrics || undefined;
}

async function enrichSourceFiles(sourceFiles: SourceAudioFile[], enhancements: TidalEnhancements): Promise<SourceAudioFile[]> {
  if (!enhancements.musicbrainz && !enhancements.lyrics) return sourceFiles;
  const enriched: SourceAudioFile[] = [];
  for (let index = 0; index < sourceFiles.length; index += 1) {
    const sourceFile = sourceFiles[index]!;
    let metadata = sourceFile.metadata;
    if (enhancements.musicbrainz) {
      if (index > 0) await sleep(1000);
      metadata = mergeMetadata(await fetchMusicBrainzMetadata(metadata), metadata);
    }
    if (enhancements.lyrics) {
      const lyrics = await fetchLyrics(metadata);
      if (lyrics) metadata = { ...metadata, lyrics };
    }
    enriched.push({ ...sourceFile, metadata });
  }
  return enriched;
}

async function enrichPreparedSourceFiles(sourceFiles: PreparedSourceAudioFile[], enhancements: TidalEnhancements): Promise<PreparedSourceAudioFile[]> {
  const enriched = await enrichSourceFiles(sourceFiles, enhancements);
  return enriched.map((file, index) => ({
    ...file,
    itemCoverPath: sourceFiles[index]?.itemCoverPath,
    itemSource: sourceFiles[index]?.itemSource ?? "tidal",
    itemSourceUrl: sourceFiles[index]?.itemSourceUrl ?? "",
  }));
}

async function measureHighFrequencyRms(filePath: string, thresholdHz: number): Promise<number | undefined> {
  const nullOutput = process.platform === "win32" ? "NUL" : "/dev/null";
  const result = await runCommand(ffmpegBinary(), [
    "-hide_banner",
    "-nostdin",
    "-i", filePath,
    "-af", `highpass=f=${thresholdHz},astats=metadata=0:reset=0`,
    "-f", "null",
    nullOutput,
  ], STATUS_TIMEOUT_MS);
  const output = `${result.stderr}\n${result.stdout}`;
  const matches = Array.from(output.matchAll(/RMS level dB:\s*(-?\d+(?:\.\d+)?)/gi));
  const values = matches.map((match) => Number(match[1])).filter((value) => Number.isFinite(value));
  if (values.length === 0) return undefined;
  return Math.max(...values);
}

async function verifyAudioQuality(filePath: string, label?: string): Promise<QualityReport> {
  const probe = await probeAudio(filePath);
  const stats = await stat(filePath).catch(() => null);
  const codec = probe.codec?.toLowerCase();
  const warnings: string[] = [];
  const sampleRate = probe.sampleRate;
  const nyquistHz = sampleRate ? sampleRate / 2 : undefined;
  const highFrequencyThresholdHz = sampleRate && sampleRate > 48000 ? 20000 : 16000;
  let highFrequencyRmsDb: number | undefined;

  if (codec === "flac") {
    if (typeof probe.bitrateKbps === "number" && probe.bitrateKbps < 400) {
      warnings.push(`FLAC bitrate is suspiciously low (${probe.bitrateKbps} kbps).`);
    }
    if (sampleRate && sampleRate >= 44100 && nyquistHz && nyquistHz > highFrequencyThresholdHz + 1000) {
      highFrequencyRmsDb = await measureHighFrequencyRms(filePath, highFrequencyThresholdHz);
      if (typeof highFrequencyRmsDb === "number" && highFrequencyRmsDb < -82) {
        warnings.push(`Very little signal energy above ${highFrequencyThresholdHz / 1000} kHz (RMS ${highFrequencyRmsDb.toFixed(1)} dB).`);
      }
    }
  }

  return {
    file: label || path.basename(filePath),
    codec: probe.codec,
    bitrateKbps: probe.bitrateKbps,
    sampleRate,
    channels: probe.channels,
    durationSec: probe.durationSec,
    sizeBytes: stats?.size,
    nyquistHz,
    highFrequencyThresholdHz,
    highFrequencyRmsDb,
    passed: warnings.length === 0,
    warnings,
  };
}

async function attachQualityReports(sourceFiles: SourceAudioFile[]): Promise<SourceAudioFile[]> {
  const verified: SourceAudioFile[] = [];
  for (const sourceFile of sourceFiles) {
    const report = await verifyAudioQuality(sourceFile.filePath);
    verified.push({ ...sourceFile, qualityReport: report });
  }
  return verified;
}

function assertQualityReportsPassed(sourceFiles: SourceAudioFile[], source: DownloadSource): void {
  const failures = sourceFiles.filter((file) => file.qualityReport && !file.qualityReport.passed);
  if (failures.length === 0) return;
  const detail = failures.map((file) => `${path.basename(file.filePath)}: ${file.qualityReport?.warnings.join("; ")}`).join(" | ");
  throw new DownloaderError(`${source === "tidal" ? "TIDAL" : "Soulseek"} quality verification failed: ${detail}`, 500, { detail });
}

async function fetchCoverArtFallback(metadata: AudioMetadata, tempDir: string): Promise<string | undefined> {
  if (!metadata.releaseMbid) return undefined;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EXTERNAL_API_TIMEOUT_MS);
  try {
    const response = await fetch(`https://coverartarchive.org/release/${encodeURIComponent(metadata.releaseMbid)}/front-500.jpg`, {
      signal: controller.signal,
      cache: "no-store",
      headers: { "User-Agent": "Turrex/1.0 (private local audio library)" },
    });
    if (!response.ok) return undefined;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength === 0) return undefined;
    const coverPath = path.join(tempDir, "cover-art-archive-front.jpg");
    await writeFile(coverPath, buffer);
    return coverPath;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeForDuplicate(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

async function findDuplicateInLibrary(libraryPath: string, metadata: AudioMetadata): Promise<string | undefined> {
  if (!libraryPath || !metadata.artist || !metadata.title) return undefined;
  const artist = normalizeForDuplicate(metadata.artist);
  const title = normalizeForDuplicate(metadata.title);
  if (!artist || !title) return undefined;
  try {
    const entries = await readdir(libraryPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const extension = path.extname(entry.name).toLowerCase();
      if (!AUDIO_EXTENSIONS.has(extension)) continue;
      const name = normalizeForDuplicate(path.basename(entry.name, extension));
      if (name.includes(artist) && name.includes(title)) return path.join(libraryPath, entry.name);
    }
  } catch {
    return undefined;
  }
  return undefined;
}

async function writeM3uPlaylist(entries: string[], playlistPath: string): Promise<void> {
  const body = ["#EXTM3U", ...entries.map((entry) => entry.replace(/\\/g, "/"))].join("\n");
  await writeFile(playlistPath, `${body}\n`, "utf8");
}

function ensureSoulseekMetadata(metadata: AudioMetadata): AudioMetadata {
  if (!metadata.artist || !metadata.title) {
    throw new DownloaderError("TIDAL download failed and Soulseek fallback needs artist/title metadata. TIDAL info did not provide enough detail.", 500);
  }
  return metadata;
}

function assertZip16Value(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > ZIP_UINT16_MAX) throw new Error(`ZIP ${label} exceeds ZIP16 limits.`);
}

function assertZip32Value(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > ZIP_UINT32_MAX) throw new Error(`ZIP ${label} exceeds ZIP32 limits.`);
}

function crc32(bytes: Uint8Array): number {
  let c = ~0;
  for (let i = 0; i < bytes.length; i += 1) {
    c ^= bytes[i] ?? 0;
    for (let j = 0; j < 8; j += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  return (~c) >>> 0;
}

function dosDateTime(date: Date): { date: number; time: number } {
  const year = Math.max(1980, Math.min(2107, date.getFullYear()));
  return {
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
  };
}

function createLocalFileHeader(nameLength: number, dataLength: number, crc: number, date: number, time: number): Uint8Array {
  const header = new Uint8Array(30);
  const view = new DataView(header.buffer);
  view.setUint32(0, ZIP_LOCAL_FILE_HEADER_SIGNATURE, true);
  view.setUint16(4, ZIP_VERSION_NEEDED, true);
  view.setUint16(6, ZIP_UTF8_FLAG, true);
  view.setUint16(8, ZIP_STORE_METHOD, true);
  view.setUint16(10, time, true);
  view.setUint16(12, date, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, dataLength, true);
  view.setUint32(22, dataLength, true);
  view.setUint16(26, nameLength, true);
  view.setUint16(28, 0, true);
  return header;
}

function createCentralDirectoryHeader(nameLength: number, dataLength: number, crc: number, localHeaderOffset: number, date: number, time: number): Uint8Array {
  const header = new Uint8Array(46);
  const view = new DataView(header.buffer);
  view.setUint32(0, ZIP_CENTRAL_DIRECTORY_SIGNATURE, true);
  view.setUint16(4, ZIP_VERSION_MADE_BY, true);
  view.setUint16(6, ZIP_VERSION_NEEDED, true);
  view.setUint16(8, ZIP_UTF8_FLAG, true);
  view.setUint16(10, ZIP_STORE_METHOD, true);
  view.setUint16(12, time, true);
  view.setUint16(14, date, true);
  view.setUint32(16, crc, true);
  view.setUint32(20, dataLength, true);
  view.setUint32(24, dataLength, true);
  view.setUint16(28, nameLength, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, localHeaderOffset, true);
  return header;
}

function createEndOfCentralDirectory(entryCount: number, centralDirectorySize: number, centralDirectoryOffset: number): Uint8Array {
  const eocd = new Uint8Array(22);
  const view = new DataView(eocd.buffer);
  view.setUint32(0, ZIP_EOCD_SIGNATURE, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, entryCount, true);
  view.setUint16(10, entryCount, true);
  view.setUint32(12, centralDirectorySize, true);
  view.setUint32(16, centralDirectoryOffset, true);
  view.setUint16(20, 0, true);
  return eocd;
}

async function makeZipBuffer(files: Array<{ path: string; filePath: string }>): Promise<Buffer> {
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const { date, time } = dosDateTime(new Date());

  assertZip16Value(files.length, "entry count");

  for (const file of files) {
    const name = encoder.encode(safeZipPath(file.path));
    const data = await readFile(file.filePath);
    assertZip16Value(name.length, "name length");
    assertZip32Value(data.byteLength, "entry size");
    assertZip32Value(offset, "offset");
    const crc = crc32(data);
    const localHeader = createLocalFileHeader(name.length, data.byteLength, crc, date, time);
    local.push(localHeader, name, data);
    const centralHeader = createCentralDirectoryHeader(name.length, data.byteLength, crc, offset, date, time);
    central.push(centralHeader, name);
    offset += localHeader.length + name.length + data.byteLength;
    assertZip32Value(offset, "offset");
  }

  const centralSize = central.reduce((sum, chunk) => sum + chunk.length, 0);
  assertZip32Value(centralSize, "central directory size");
  return Buffer.concat([...local, ...central, createEndOfCentralDirectory(files.length, centralSize, offset)]);
}

async function writeZipFile(files: Array<{ path: string; filePath: string }>, zipPath: string): Promise<void> {
  await writeFile(zipPath, await makeZipBuffer(files));
}

function dispositionFileName(fileName: string): string {
  return fileName.replace(/["\r\n]/g, "_");
}

function responseHeaders(result: ProcessResult, bufferLength?: number): Headers {
  const headers = new Headers({
    "Content-Type": "application/zip",
    "Content-Disposition": `attachment; filename="${dispositionFileName(result.fileName)}"`,
    "Cache-Control": "no-store",
    "X-Turrex-Tidal-Profile": result.profile,
    "X-Turrex-Source-URL": encodeURIComponent(result.sourceUrl),
    "X-Turrex-Source": result.source,
    "X-Turrex-Track-Count": String(result.trackCount),
    "X-Turrex-Request-ID": result.requestId,
    "X-Turrex-Zip-Path": result.zipPath,
  });
  if (result.albumMeta?.length) headers.set("X-Turrex-Album-Meta", encodeURIComponent(JSON.stringify(result.albumMeta)));
  if (typeof bufferLength === "number") headers.set("Content-Length", String(bufferLength));
  return headers;
}

function errorResponse(message: string, status = 500, extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ error: message, detail: message, ...extra }, { status });
}

function statusFromError(error: unknown): number {
  if (error instanceof DownloaderError) return error.status;
  const message = messageFromUnknown(error).toLowerCase();
  if (message.includes("invalid tidal")) return 400;
  if (message.includes("authorization") || message.includes("login")) return 401;
  if (message.includes("rate limited")) return 429;
  return 500;
}

function sseLine(event: ProgressEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function pruneTokenStore() {
  const now = Date.now();
  for (const [token, entry] of tokenStore.entries()) {
    if (now - entry.createdAt <= TOKEN_TTL_MS) continue;
    tokenStore.delete(token);
    void rm(entry.tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function processTidalDownload(body: TidalRequestBody, emit?: (event: ProgressEvent) => void | Promise<void>): Promise<ProcessResult> {
  const requestId = crypto.randomUUID();
  const tempDir = await mkdtemp(path.join(tmpdir(), "turrex-tidal-"));
  const tidalDir = path.join(tempDir, "tidal");
  const soulseekDir = path.join(tempDir, "soulseek");
  const processedDir = path.join(tempDir, "processed");
  const zipPath = path.join(tempDir, "tidal-download.zip");

  try {
    await Promise.all([
      mkdir(tidalDir, { recursive: true }),
      mkdir(soulseekDir, { recursive: true }),
      mkdir(processedDir, { recursive: true }),
    ]);

    const requestedTracks = tracksFromUnknown(body.tracks);
    const hasTrackBatch = requestedTracks.length > 0;
    const url = stringField(body.url);
    if (!hasTrackBatch && (!url || !isTidalUrl(url))) throw new DownloaderError("Invalid TIDAL URL. Paste a TIDAL track, album, or playlist URL.", 400);
    const requestedProfile = isTidalProfileId(body.profile) ? body.profile : "audiophile-flac";
    const preview = Boolean(body.preview);
    const profile = preview ? profileById["hifi-mp3"] : profileById[requestedProfile];
    const enhancements = enhancementsFromUnknown(body.enhancements);
    const useSoulseekFallback = body.useSoulseekFallback !== false;
    let coverPath = (enhancements.embedCover ?? profile.cover) ? await writeCoverArt(body.coverArt, tempDir) : undefined;
    const tidalKind = hasTrackBatch ? "playlist" : classifyTidalUrl(url);
    const metadataOverride = metadataOverrideFromUnknown(body.metadataOverride);
    const libraryPath = stringField(body.libraryPath);
    const forceDownload = Boolean(body.force);
    const filenameTemplate = stringField(body.filenameTemplate) || "{artist} - {title}.{ext}";
    const postAction = postActionFromUnknown(body.postAction);
    const postCommand = stringField(body.postCommand);
    const sourceUrl = hasTrackBatch ? `track-batch:${requestedTracks.length}` : url;
    const firstTrack = requestedTracks[0];

    await emit?.({ step: "validating", progress: 6, message: hasTrackBatch ? `Preparing ${requestedTracks.length} imported track${requestedTracks.length === 1 ? "" : "s"}...` : `Checking TIDAL ${tidalKind} metadata...`, source: "tidal" });
    const info = hasTrackBatch
      ? { metadata: firstTrack ? { artist: firstTrack.artist, title: firstTrack.title, album: firstTrack.album, year: firstTrack.year, genre: firstTrack.genre } : undefined, output: "", ok: true }
      : await runTidalInfo(url).catch((error: unknown) => ({ metadata: undefined, output: messageFromUnknown(error), ok: false }));
    const fallbackMetadata = mergeMetadata(metadataOverride, mergeMetadata(info.metadata, hasTrackBatch && firstTrack
      ? { artist: firstTrack.artist, title: firstTrack.title, album: firstTrack.album || DEFAULT_ALBUM, year: firstTrack.year, genre: firstTrack.genre }
      : metadataFromUrl(url)));

    if (!hasTrackBatch && !preview && libraryPath && !forceDownload) {
      const existingFile = await findDuplicateInLibrary(libraryPath, fallbackMetadata);
      if (existingFile) {
        await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
        return {
          requestId,
          tempDir,
          zipPath,
          fileName: "duplicate-skipped.json",
          profile: profile.id,
          sourceUrl: url,
          source: "tidal",
          trackCount: 0,
          skipped: true,
          reason: "duplicate",
          existingFile,
        };
      }
    }

    let source: DownloadSource = "tidal";
    let sourceFiles: PreparedSourceAudioFile[] = [];
    let tidalFailure: unknown;
    let qualityReports: QualityReport[] = [];

    if (hasTrackBatch) {
      for (let trackIndex = 0; trackIndex < requestedTracks.length; trackIndex += 1) {
        const track = requestedTracks[trackIndex]!;
        const trackNumber = trackIndex + 1;
        const trackTempDir = path.join(tempDir, `track-${trackNumber}`);
        const trackTidalDir = path.join(trackTempDir, "tidal");
        const trackSoulseekDir = path.join(trackTempDir, "soulseek");
        await Promise.all([
          mkdir(trackTempDir, { recursive: true }),
          mkdir(trackTidalDir, { recursive: true }),
          mkdir(trackSoulseekDir, { recursive: true }),
        ]);
        const trackMetadata = mergeMetadata(metadataOverride, {
          artist: track.artist,
          title: track.title || "Unknown Title",
          album: track.album || DEFAULT_ALBUM,
          year: track.year,
          genre: track.genre,
        });
        let itemCoverPath = (enhancements.embedCover ?? profile.cover) ? await writeCoverArt(track.coverArt, trackTempDir) : undefined;
        if (!itemCoverPath) itemCoverPath = coverPath;
        if (itemCoverPath && enhancements.resizeCover) itemCoverPath = await resizeCoverArt(itemCoverPath, trackTempDir);
        let trackUrl = track.url;
        if (!trackUrl && trackMetadata.artist && trackMetadata.title) {
          await emit?.({ step: "validating", progress: Math.round(8 + (trackIndex / requestedTracks.length) * 16), message: `Searching TIDAL for ${trackMetadata.artist} - ${trackMetadata.title}...`, source: "tidal" });
          trackUrl = await searchTidalTrackUrl(`${trackMetadata.artist} - ${trackMetadata.title}`).catch(() => undefined);
        }

        let itemSource: DownloadSource = "tidal";
        let itemFiles: SourceAudioFile[] = [];
        try {
          if (!trackUrl) throw new DownloaderError(`No TIDAL result found for ${trackMetadata.artist} - ${trackMetadata.title}.`, 404);
          await emit?.({ step: "downloading", progress: Math.round(18 + (trackIndex / requestedTracks.length) * 25), message: `Downloading ${trackMetadata.title} with tidekeeper (${trackNumber}/${requestedTracks.length})...`, source: "tidal" });
          await runTidalDownload(trackUrl, trackTidalDir);
          itemFiles = await sourceFilesFromDirectory(trackTidalDir, trackMetadata, "tidal");
          if (itemFiles.length === 0) throw new DownloaderError("TIDAL completed but did not create FLAC, M4A, or MP3 files.", 500);
          if (enhancements.verifyQuality) {
            await emit?.({ step: "validating", progress: Math.round(34 + (trackIndex / requestedTracks.length) * 10), message: `Verifying ${trackMetadata.title} audio quality...`, source: "tidal" });
            itemFiles = await attachQualityReports(itemFiles);
            assertQualityReportsPassed(itemFiles, "tidal");
          }
        } catch (error) {
          tidalFailure = error;
          if (!useSoulseekFallback) throw error;
          if (error instanceof DownloaderError && (error.status === 401 || error.status === 429)) throw error;
          const soulseekMetadata = ensureSoulseekMetadata(trackMetadata);
          await emit?.({ step: "downloading", progress: Math.round(30 + (trackIndex / requestedTracks.length) * 24), message: `TIDAL failed, searching Soulseek for ${soulseekMetadata.artist} - ${soulseekMetadata.title}...`, source: "soulseek" });
          const csvPath = path.join(trackTempDir, "soulseek-query.csv");
          await runSoulseekFallback(soulseekMetadata, csvPath, trackSoulseekDir);
          itemSource = "soulseek";
          source = "soulseek";
          itemFiles = await sourceFilesFromDirectory(trackSoulseekDir, soulseekMetadata, "soulseek");
          if (itemFiles.length === 0) {
            const tidalMessage = tidalFailure ? messageFromUnknown(tidalFailure) : "Unknown TIDAL error.";
            throw new DownloaderError(`Soulseek fallback completed but no verified audio files were found. TIDAL error was: ${tidalMessage}`, 500);
          }
          if (enhancements.verifyQuality) {
            await emit?.({ step: "validating", progress: Math.round(36 + (trackIndex / requestedTracks.length) * 10), message: `Verifying Soulseek fallback for ${soulseekMetadata.title}...`, source: "soulseek" });
            itemFiles = await attachQualityReports(itemFiles);
            assertQualityReportsPassed(itemFiles, "soulseek");
          }
        }
        sourceFiles.push(...itemFiles.map((file) => ({
          ...file,
          metadata: mergeMetadata(file.metadata, trackMetadata),
          itemCoverPath,
          itemSource,
          itemSourceUrl: trackUrl || "",
        })));
      }
    } else {
      await emit?.({ step: "downloading", progress: 18, message: "Downloading Hi-Res audio with tidekeeper...", source: "tidal" });
      try {
        await runTidalDownload(url, tidalDir);
        const tidalFiles = await sourceFilesFromDirectory(tidalDir, fallbackMetadata, "tidal");
        if (tidalFiles.length === 0) throw new DownloaderError("TIDAL completed but did not create FLAC, M4A, or MP3 files.", 500);
        sourceFiles = tidalFiles.map((file) => ({ ...file, itemCoverPath: coverPath, itemSource: "tidal", itemSourceUrl: url }));
        if (enhancements.verifyQuality) {
          await emit?.({ step: "validating", progress: 34, message: "Verifying TIDAL audio quality...", source: "tidal" });
          sourceFiles = (await attachQualityReports(sourceFiles)).map((file, index) => ({ ...file, itemCoverPath: sourceFiles[index]?.itemCoverPath, itemSource: "tidal", itemSourceUrl: url }));
          assertQualityReportsPassed(sourceFiles, "tidal");
        }
      } catch (error) {
        tidalFailure = error;
        if (!useSoulseekFallback) throw error;
        if (error instanceof DownloaderError && (error.status === 401 || error.status === 429)) throw error;

        const soulseekMetadata = ensureSoulseekMetadata(fallbackMetadata);
        await emit?.({ step: "downloading", progress: 30, message: "TIDAL failed, searching Soulseek fallback with slsk-batchdl...", source: "soulseek" });
        const csvPath = path.join(tempDir, "soulseek-query.csv");
        await runSoulseekFallback(soulseekMetadata, csvPath, soulseekDir);
        source = "soulseek";
        const soulseekFiles = await sourceFilesFromDirectory(soulseekDir, soulseekMetadata, "soulseek");
        sourceFiles = soulseekFiles.map((file) => ({ ...file, itemCoverPath: coverPath, itemSource: "soulseek", itemSourceUrl: url }));
        if (sourceFiles.length === 0) {
          const tidalMessage = tidalFailure ? messageFromUnknown(tidalFailure) : "Unknown TIDAL error.";
          throw new DownloaderError(`Soulseek fallback completed but no verified audio files were found. TIDAL error was: ${tidalMessage}`, 500);
        }
        if (enhancements.verifyQuality) {
          await emit?.({ step: "validating", progress: 36, message: "Verifying Soulseek fallback quality...", source: "soulseek" });
          sourceFiles = (await attachQualityReports(sourceFiles)).map((file, index) => ({ ...file, itemCoverPath: sourceFiles[index]?.itemCoverPath, itemSource: "soulseek", itemSourceUrl: url }));
          assertQualityReportsPassed(sourceFiles, "soulseek");
        }
      }
    }
    sourceFiles = await enrichPreparedSourceFiles(sourceFiles, enhancements);
    qualityReports = sourceFiles.map((file) => file.qualityReport).filter((report): report is QualityReport => Boolean(report));

    if (coverPath && enhancements.resizeCover) {
      const originalCoverPath = coverPath;
      coverPath = await resizeCoverArt(coverPath, tempDir);
      sourceFiles = sourceFiles.map((file) => file.itemCoverPath === originalCoverPath ? { ...file, itemCoverPath: coverPath } : file);
    }
    sourceFiles = await Promise.all(sourceFiles.map(async (file, index) => {
      if (file.itemCoverPath || !(enhancements.embedCover ?? profile.cover) || !(enhancements.coverFallback ?? true)) return file;
      const fallbackDir = path.join(tempDir, `cover-fallback-${index}`);
      await mkdir(fallbackDir, { recursive: true }).catch(() => undefined);
      const fallbackCover = await fetchCoverArtFallback(file.metadata, fallbackDir).catch(() => undefined);
      return { ...file, itemCoverPath: fallbackCover };
    }));

    const zipFiles: Array<{ path: string; filePath: string }> = [];
    const usedNames = new Set<string>();
    const playlistEntries: string[] = [];
    const albumMeta: AlbumMetaEntry[] = [];
    for (let index = 0; index < sourceFiles.length; index += 1) {
      const sourceFile = sourceFiles[index]!;
      const fileName = getUniqueFileName(fileNameFromTemplate(filenameTemplate, sourceFile.metadata, profile, index + 1, preview), usedNames);
      const outputPath = path.join(processedDir, fileName);
      const progress = Math.round(38 + ((index + 1) / sourceFiles.length) * 45);
      await emit?.({ step: "transcoding", progress, message: `Processing ${fileName} (${index + 1}/${sourceFiles.length})...`, file: fileName, source: sourceFile.itemSource });
      await runFfmpeg(profile, sourceFile.filePath, outputPath, {
        coverPath: sourceFile.itemCoverPath,
        metadata: sourceFile.metadata,
        sourceCodec: sourceFile.codec,
        durationSec: sourceFile.durationSec,
        enhancements,
        preview,
      });
      if (enhancements.verifyQuality) {
        const outputReport = await verifyAudioQuality(outputPath, fileName);
        qualityReports.push(outputReport);
        if (!outputReport.passed) {
          throw new DownloaderError(`Processed file quality verification failed: ${outputReport.warnings.join("; ")}`, 500, { detail: JSON.stringify(outputReport) });
        }
      }
      zipFiles.push({ path: `Turrex TIDAL Export/tracks/${fileName}`, filePath: outputPath });
      playlistEntries.push(`tracks/${fileName}`);
      albumMeta.push({
        artist: sourceFile.metadata.artist || "Unknown Artist",
        title: sourceFile.metadata.title || path.basename(sourceFile.filePath, path.extname(sourceFile.filePath)),
        trackNumber: index + 1,
        duration: sourceFile.durationSec,
        file: `tracks/${fileName}`,
      });
    }

    if (!preview && (enhancements.generatePlaylist ?? true) && playlistEntries.length > 0) {
      const playlistPath = path.join(tempDir, "playlist.m3u8");
      await writeM3uPlaylist(playlistEntries, playlistPath);
      zipFiles.push({ path: "Turrex TIDAL Export/playlist.m3u8", filePath: playlistPath });
    }

    if (enhancements.verifyQuality) {
      const qualityReportPath = path.join(tempDir, "quality-report.json");
      await writeFile(qualityReportPath, JSON.stringify({
        generatedAtIso: new Date().toISOString(),
        source,
        sourceUrl,
        reports: qualityReports,
      }, null, 2));
      zipFiles.push({ path: "Turrex TIDAL Export/quality-report.json", filePath: qualityReportPath });
    }

    const manifestPath = path.join(tempDir, "manifest.json");
    await writeFile(manifestPath, JSON.stringify({
      app: "Turrex",
      exporter: "download-4 TIDAL Hi-Res",
      endpoint: "/api/download/tidal",
      sourceUrl,
      sourceType: tidalKind,
      requestedTracks: hasTrackBatch ? requestedTracks.map((track) => ({
        artist: track.artist,
        title: track.title,
        album: track.album,
        url: track.url,
      })) : undefined,
      source,
      profile: profile.id,
      requestedProfile,
      preview,
      fallbackEnabled: useSoulseekFallback,
      fallbackReason: source === "soulseek" && tidalFailure ? messageFromUnknown(tidalFailure).slice(0, 1000) : undefined,
      trackCount: sourceFiles.length,
      createdAtIso: new Date().toISOString(),
      enhancements,
      filenameTemplate,
      metadataOverride,
      qualityReports,
      albumMeta,
      sourceFiles: sourceFiles.map((file) => ({
        path: path.basename(file.filePath),
        source: file.itemSource,
        sourceUrl: file.itemSourceUrl,
        codec: file.codec,
        bitrateKbps: file.bitrateKbps,
        sampleRate: file.sampleRate,
        durationSec: file.durationSec,
        sizeBytes: file.sizeBytes,
        metadata: file.metadata,
      })),
      files: zipFiles.map((file) => file.path),
    }, null, 2));
    zipFiles.push({ path: "Turrex TIDAL Export/manifest.json", filePath: manifestPath });

    await emit?.({ step: "zipping", progress: 92, message: "Packaging ZIP export...", source });
    await writeZipFile(zipFiles, zipPath);
    const zipStats = await stat(zipPath).catch(() => null);
    if (!zipStats || zipStats.size === 0) throw new Error("ZIP packaging completed without a usable file.");
    if (postCommand) await runAllowedPostCommand(postCommand, zipPath);

    return {
      requestId,
      tempDir,
      zipPath,
      fileName: preview ? "tidal-preview.zip" : "tidal-download.zip",
      profile: profile.id,
      sourceUrl,
      source,
      trackCount: sourceFiles.length,
      albumMeta: sourceFiles.length > 1 || tidalKind !== "track" || hasTrackBatch ? albumMeta : undefined,
      postAction,
    };
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

async function handleRetrieve(token: string | null): Promise<Response> {
  pruneTokenStore();
  if (!token) return errorResponse("Missing download token.", 400);
  const entry = tokenStore.get(token);
  if (!entry) return errorResponse("Download token expired or was already used.", 404);
  tokenStore.delete(token);
  try {
    const buffer = await readFile(entry.zipPath);
    const resultForHeaders: ProcessResult = {
      requestId: entry.requestId,
      tempDir: entry.tempDir,
      zipPath: entry.zipPath,
      fileName: entry.fileName,
      profile: entry.profile,
      sourceUrl: entry.sourceUrl,
      source: entry.source,
      trackCount: entry.trackCount,
      albumMeta: entry.albumMeta,
      postAction: entry.postAction,
    };
    return new Response(buffer, {
      status: 200,
      headers: responseHeaders(resultForHeaders, buffer.byteLength),
    });
  } finally {
    await rm(entry.tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  const action = request.nextUrl.searchParams.get("action");
  if (action === "retrieve") return handleRetrieve(request.nextUrl.searchParams.get("token"));
  if (action === "search") return handleSearch(request.nextUrl.searchParams.get("q"));
  if (action !== "status") return errorResponse("Unsupported TIDAL GET action.", 400);

  const [tidal, soulseek, ffmpeg, ffprobe, lyrics, musicbrainz, writable, searchToken] = await Promise.allSettled([
    runTidekeeperStatus(),
    runProbe(soulseekBinary(), ["--help"]),
    runProbe(ffmpegBinary(), ["-version"]),
    runProbe(ffprobeBinary(), ["-version"]),
    checkServiceAvailable("lyrics", "https://api.lyrics.ovh/v1/Coldplay/Yellow"),
    checkServiceAvailable("musicbrainz", "https://musicbrainz.org/ws/2/recording/?query=recording:Yellow&fmt=json&limit=1", {
      headers: { "User-Agent": "Turrex/1.0 (private local audio library)" },
    }),
    checkTempWritable(tmpdir()),
    getTidalAccessToken(),
  ]);

  const tidalResult = tidal.status === "fulfilled" ? tidal.value : { available: false, error: "tidekeeper probe failed.", configPath: tidalConfigPath(), configExists: false, loggedIn: false };
  const soulseekResult = soulseek.status === "fulfilled" ? soulseek.value : { available: false, error: "Soulseek probe failed." };
  const ffmpegResult = ffmpeg.status === "fulfilled" ? ffmpeg.value : { available: false, error: "ffmpeg probe failed." };
  const ffprobeResult = ffprobe.status === "fulfilled" ? ffprobe.value : { available: false, error: "ffprobe probe failed." };
  const lyricsAvailable = lyrics.status === "fulfilled" ? lyrics.value : false;
  const musicbrainzAvailable = musicbrainz.status === "fulfilled" ? musicbrainz.value : false;
  const writableResult = writable.status === "fulfilled" ? writable.value : false;
  const searchTokenValue = searchToken.status === "fulfilled" ? searchToken.value : null;
  const searchAvailable = Boolean(searchTokenValue);
  const searchTokenExpiry = searchAvailable ? cachedToken?.tokenExpiry : undefined;
  const tokenExpiry = searchTokenExpiry ?? parseTokenExpiry(tidalResult.doctor || "");

  return NextResponse.json({
    tidal: tidalResult,
    soulseek: soulseekResult,
    ffmpeg: ffmpegResult,
    ffprobe: ffprobeResult,
    tokenExpiry,
    lyricsAvailable,
    musicbrainzAvailable,
    searchAvailable,
    tidalSearch: {
      available: searchAvailable,
      message: searchAvailable ? "Token-backed search ready" : (lastTidalTokenError || "Login token required"),
      tokenExpiry,
      rateLimitRemaining: tidalSearchRateLimitRemaining(),
    },
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
    tempDir: tmpdir(),
    writable: writableResult,
    checkedAtIso: new Date().toISOString(),
  } satisfies StatusPayload);
}

export async function POST(request: NextRequest): Promise<Response> {
  const action = request.nextUrl.searchParams.get("action");
  if (action === "login") return handleLogin();
  if (action && action !== "download") return errorResponse("Unsupported TIDAL POST action.", 400);

  const wantsSse = request.headers.get("accept")?.toLowerCase().includes("text/event-stream") ?? false;
  let body: TidalRequestBody;
  try {
    body = await request.json() as TidalRequestBody;
  } catch {
    return errorResponse("Invalid JSON body.", 400);
  }

  if (wantsSse) {
    const streamEncoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (event: ProgressEvent) => controller.enqueue(streamEncoder.encode(sseLine(event)));
        void (async () => {
          try {
            pruneTokenStore();
            const result = await processTidalDownload(body, send);
            if (result.skipped) {
              send({
                step: "complete",
                progress: 100,
                message: result.reason === "duplicate" ? "Skipped duplicate library item." : "Skipped.",
                skipped: true,
                reason: result.reason,
                existingFile: result.existingFile,
                source: result.source,
              });
              return;
            }
            const token = crypto.randomUUID();
            tokenStore.set(token, {
              zipPath: result.zipPath,
              tempDir: result.tempDir,
              fileName: result.fileName,
              createdAt: Date.now(),
              requestId: result.requestId,
              profile: result.profile,
              sourceUrl: result.sourceUrl,
              source: result.source,
              trackCount: result.trackCount,
              albumMeta: result.albumMeta,
              postAction: result.postAction,
            });
            send({
              step: "complete",
              progress: 100,
              message: "ZIP download ready",
              token,
              file: `/api/download/tidal?action=retrieve&token=${encodeURIComponent(token)}`,
              source: result.source,
              zipPath: result.zipPath,
              albumMeta: result.albumMeta,
            });
          } catch (error) {
            send({
              step: "error",
              progress: 100,
              message: messageFromUnknown(error) || "TIDAL download failed.",
              status: statusFromError(error),
              retryAfter: error instanceof DownloaderError ? error.retryAfter : undefined,
            });
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
    result = await processTidalDownload(body);
    if (result.skipped) {
      return NextResponse.json({
        skipped: true,
        reason: result.reason,
        existingFile: result.existingFile,
        requestId: result.requestId,
      });
    }
    const buffer = await readFile(result.zipPath);
    return new Response(buffer, { status: 200, headers: responseHeaders(result, buffer.byteLength) });
  } catch (error) {
    return errorResponse(messageFromUnknown(error) || "TIDAL download failed.", statusFromError(error), {
      requestId: result?.requestId,
      retryAfter: error instanceof DownloaderError ? error.retryAfter : undefined,
    });
  } finally {
    if (result?.tempDir) await rm(result.tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
