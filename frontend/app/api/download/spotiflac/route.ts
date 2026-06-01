import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SpotiflacProfileId = "audiophile-flac" | "hifi-mp3" | "phone-aac-plus" | "normalized-mp3" | "analysis-only";
type AudioFormat = "flac" | "mp3" | "m4a";

type SpotiflacEnhancements = {
  truePeakLimiter?: boolean;
  stereoEnhance?: boolean;
  embedCover?: boolean;
  embedMetadata?: boolean;
};

type SpotiflacRequestBody = {
  url?: unknown;
  profile?: unknown;
  preview?: unknown;
  coverArt?: unknown;
  enhancements?: unknown;
};

type ProfileDescriptor = {
  id: SpotiflacProfileId;
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
  zipPath: string;
  tempDir: string;
  fileName: string;
  createdAt: number;
};

type ProgressEvent = {
  step: "validating" | "downloading" | "transcoding" | "zipping" | "complete" | "error";
  progress: number;
  message: string;
  file?: string;
  token?: string;
};

type ProcessResult = {
  requestId: string;
  tempDir: string;
  zipPath: string;
  fileName: string;
  profile: SpotiflacProfileId;
  sourceUrl: string;
  trackCount: number;
};

type StatusPayload = {
  spotiflac: { available: boolean; version?: string; error?: string; errorCode?: string };
  ffmpeg: { available: boolean; version?: string; error?: string; errorCode?: string };
  profiles: Array<ProfileDescriptor & { features: Record<string, boolean | string> }>;
  tempDir: string;
  writable: boolean;
  checkedAtIso: string;
};

const REQUEST_TIMEOUT_MS = 180000;
const STATUS_TIMEOUT_MS = 8000;
const OUTPUT_LIMIT = 128000;
const TOKEN_TTL_MS = 15 * 60 * 1000;
const ZIP_UINT16_MAX = 0xffff;
const ZIP_UINT32_MAX = 0xffffffff;
const ZIP_LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const ZIP_EOCD_SIGNATURE = 0x06054b50;
const ZIP_VERSION_NEEDED = 20;
const ZIP_VERSION_MADE_BY = 20;
const ZIP_UTF8_FLAG = 0x0800;
const ZIP_STORE_METHOD = 0;
const DEFAULT_ALBUM = "Turrex Export";
const encoder = new TextEncoder();
const tokenStore = new Map<string, TokenEntry>();

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

const profileById = Object.fromEntries(profiles.map((profile) => [profile.id, profile])) as Record<SpotiflacProfileId, ProfileDescriptor>;

function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isSpotiflacProfileId(value: unknown): value is SpotiflacProfileId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(profileById, value);
}

function isSpotifyUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    const segments = parsed.pathname.split("/").filter(Boolean);
    return (host === "open.spotify.com" || host.endsWith(".spotify.com"))
      && ["track", "album", "playlist"].includes(segments[0] ?? "")
      && Boolean(segments[1]);
  } catch {
    return false;
  }
}

function classifySpotifyUrl(value: string): "track" | "album" | "playlist" {
  try {
    const kind = new URL(value).pathname.split("/").filter(Boolean)[0];
    return kind === "album" || kind === "playlist" ? kind : "track";
  } catch {
    return "track";
  }
}

function enhancementsFromUnknown(value: unknown): SpotiflacEnhancements {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  return {
    truePeakLimiter: typeof record.truePeakLimiter === "boolean" ? record.truePeakLimiter : undefined,
    stereoEnhance: typeof record.stereoEnhance === "boolean" ? record.stereoEnhance : undefined,
    embedCover: typeof record.embedCover === "boolean" ? record.embedCover : undefined,
    embedMetadata: typeof record.embedMetadata === "boolean" ? record.embedMetadata : undefined,
  };
}

function spotiflacBinary(): string {
  return process.env.SPOTIFLAC_PATH || "spotiflac";
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

function capOutput(current: string, next: string): string {
  return (current + next).slice(-OUTPUT_LIMIT);
}

function messageFromUnknown(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function runCommand(binary: string, args: string[], timeoutMs = REQUEST_TIMEOUT_MS, cwd?: string, options?: { env?: NodeJS.ProcessEnv }): Promise<CommandResult> {
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

async function runProbe(binary: string, args: string[]): Promise<{ available: boolean; version?: string; error?: string; errorCode?: string }> {
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

async function checkTempWritable(dir: string): Promise<boolean> {
  const probeDir = await mkdtemp(path.join(dir, "turrex-spotiflac-status-"));
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
  return cleaned || "Turrex SpotiFLAC Track";
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

async function findFilesByExtension(dir: string, extension: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...await findFilesByExtension(fullPath, extension));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(extension)) {
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

function buildFilterChain(profile: ProfileDescriptor, enhancements: SpotiflacEnhancements): string[] {
  if (profile.id === "audiophile-flac") return [];
  const truePeakLimiter = enhancements.truePeakLimiter ?? profile.truePeakLimiter;
  const stereoEnhance = enhancements.stereoEnhance ?? profile.stereoEnhance;
  const filters: string[] = [];
  if (profile.loudnorm) filters.push("loudnorm=I=-16:LRA=11:TP=-1.5:print_format=json");
  if (truePeakLimiter) filters.push("alimiter=limit=0.891:attack=5:release=50:level=disabled");
  if (stereoEnhance) filters.push("stereotools=mode=lr>ms:ms_lr_balance=0.25,stereotools=mode=ms>lr");
  return filters;
}

function metadataArgs(enabled: boolean): string[] {
  if (!enabled) return [];
  const year = new Date().getFullYear();
  return [
    "-metadata", `album=${DEFAULT_ALBUM}`,
    "-metadata", `date=${year}`,
    "-metadata", "comment=Turrex SpotiFLAC Export",
    "-metadata", "encoded_by=Turrex",
  ];
}

function buildFfmpegArgs(profile: ProfileDescriptor, input: string, output: string, options: {
  coverPath?: string;
  enhancements: SpotiflacEnhancements;
  preview: boolean;
}): string[] {
  const embedMetadata = options.enhancements.embedMetadata ?? profile.metadata;
  const embedCover = options.enhancements.embedCover ?? profile.cover;
  const filters = buildFilterChain(profile, options.enhancements);
  const args = ["-hide_banner", "-nostdin", "-y"];

  if (options.preview) args.push("-ss", "0", "-t", "30");
  args.push("-i", input);
  if (options.coverPath && embedCover) args.push("-i", options.coverPath);

  if (profile.id === "audiophile-flac" && !options.coverPath) {
    args.push("-map", "0", "-c", "copy");
  } else {
    args.push("-map", "0:a:0");
    if (options.coverPath && embedCover) {
      args.push("-map", "1:v:0", "-disposition:v:0", "attached_pic", "-c:v", "copy", "-metadata:s:v", "title=Album cover", "-metadata:s:v", "comment=Cover (front)");
    } else if (embedCover) {
      args.push("-map", "0:v:0?", "-disposition:v:0", "attached_pic");
    }
    args.push(...profile.codecArgs);
  }

  if (filters.length > 0) args.push("-af", filters.join(","));
  args.push(...metadataArgs(embedMetadata));
  args.push(output);
  return args;
}

async function runFfmpeg(profile: ProfileDescriptor, inputPath: string, outputPath: string, options: {
  coverPath?: string;
  enhancements: SpotiflacEnhancements;
  preview: boolean;
}): Promise<void> {
  const result = await runCommand(ffmpegBinary(), buildFfmpegArgs(profile, inputPath, outputPath, options), REQUEST_TIMEOUT_MS);
  if (!result.ok) {
    const detail = `${result.stderr || result.stdout || "ffmpeg failed."}`.replace(/\s+/g, " ").trim();
    throw new Error(`Transcoding failed: ${detail.slice(0, 1600)}`);
  }
  const outputStats = await stat(outputPath).catch(() => null);
  if (!outputStats || outputStats.size === 0) throw new Error("Transcoding completed without a usable output file.");
}

async function runSpotiflac(url: string, outputDir: string): Promise<{ stdout: string; stderr: string }> {
  const args = [
    url,
    outputDir,
    "--quality", "LOSSLESS",
    "--service", "qobuz", "deezer", "amazon",
  ];
  const env = {
    ...process.env,
    PYTHONUTF8: "1",
    LANG: "C.UTF-8",
    PYTHONIOENCODING: "utf-8",
  };
  const result = await runCommand(spotiflacBinary(), args, REQUEST_TIMEOUT_MS, undefined, { env });
  const output = `${result.stderr}\n${result.stdout}`.trim();

  if (!result.ok) {
    if (result.errorCode === "ENOENT" || output.toLowerCase().includes("not recognized")) {
      throw new Error(
        "SpotiFLAC is not installed or SPOTIFLAC_PATH is not configured. " +
        "Install it with `pip install spotiflac` or set SPOTIFLAC_PATH to the executable."
      );
    }
    throw new Error(
      `SpotiFLAC download failed: ${(output || "No error output.").slice(0, 1800)}`
    );
  }

  return { stdout: result.stdout, stderr: result.stderr };
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
    "X-Turrex-Spotiflac-Profile": result.profile,
    "X-Turrex-Source-URL": encodeURIComponent(result.sourceUrl),
    "X-Turrex-Track-Count": String(result.trackCount),
    "X-Turrex-Request-ID": result.requestId,
  });
  if (typeof bufferLength === "number") headers.set("Content-Length", String(bufferLength));
  return headers;
}

function errorResponse(message: string, status = 500, extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ error: message, detail: message, ...extra }, { status });
}

function statusFromError(error: unknown): number {
  const message = messageFromUnknown(error).toLowerCase();
  if (message.includes("invalid spotify")) return 400;
  if (message.includes("spotiflac is not installed")) return 500;
  if (message.includes("spotiflac download failed")) return 500;
  if (message.includes("transcoding")) return 500;
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

async function processSpotiflacDownload(body: SpotiflacRequestBody, emit?: (event: ProgressEvent) => void | Promise<void>): Promise<ProcessResult> {
  const requestId = crypto.randomUUID();
  const tempDir = await mkdtemp(path.join(tmpdir(), "turrex-spotiflac-"));
  const sourceDir = path.join(tempDir, "source");
  const processedDir = path.join(tempDir, "processed");
  const zipPath = path.join(tempDir, "spotiflac-download.zip");

  try {
    await Promise.all([
      mkdir(sourceDir, { recursive: true }),
      mkdir(processedDir, { recursive: true }),
    ]);

    const url = stringField(body.url);
    if (!url || !isSpotifyUrl(url)) throw new Error("Invalid Spotify URL. Paste an open.spotify.com track, album, or playlist URL.");
    const requestedProfile = isSpotiflacProfileId(body.profile) ? body.profile : "audiophile-flac";
    const preview = Boolean(body.preview);
    const profile = preview ? profileById["hifi-mp3"] : profileById[requestedProfile];
    const enhancements = enhancementsFromUnknown(body.enhancements);
    const coverPath = (enhancements.embedCover ?? profile.cover) ? await writeCoverArt(body.coverArt, tempDir) : undefined;
    const spotifyKind = classifySpotifyUrl(url);

    await emit?.({ step: "validating", progress: 8, message: `Preparing ${spotifyKind} download with SpotiFLAC...` });
    await emit?.({ step: "downloading", progress: 20, message: "Downloading lossless FLAC from SpotiFLAC..." });
    const { stdout, stderr } = await runSpotiflac(url, sourceDir);
        const cliOutput = `${stderr}\n${stdout}`;
    const flacFiles = await findFilesByExtension(sourceDir, ".flac");
    if (flacFiles.length === 0) {
          const allFiles = await readdir(sourceDir);
          if (allFiles.length > 0) {
            throw new Error(
              `SpotiFLAC did not create FLAC files, but found: ${allFiles.join(", ")}. CLI output: ${cliOutput.slice(0, 800)}`
            );
          }
          throw new Error(
            `SpotiFLAC completed but did not create any files. CLI output: ${cliOutput.slice(0, 800)}`
          );
        }

    const zipFiles: Array<{ path: string; filePath: string }> = [];
    const usedNames = new Set<string>();
    for (let index = 0; index < flacFiles.length; index += 1) {
      const sourcePath = flacFiles[index]!;
      const baseName = sanitizeFileName(path.basename(sourcePath, path.extname(sourcePath)));
      const fileName = getUniqueFileName(`${preview ? "preview_" : ""}${baseName}.${profile.extension}`, usedNames);
      const outputPath = path.join(processedDir, fileName);
      const progress = Math.round(35 + ((index + 1) / flacFiles.length) * 45);
      await emit?.({ step: "transcoding", progress, message: `Processing ${fileName} (${index + 1}/${flacFiles.length})...`, file: fileName });
      await runFfmpeg(profile, sourcePath, outputPath, { coverPath, enhancements, preview });
      zipFiles.push({ path: `Turrex SpotiFLAC Export/tracks/${fileName}`, filePath: outputPath });
    }

    const manifestPath = path.join(tempDir, "manifest.json");
    await writeFile(manifestPath, JSON.stringify({
      app: "Turrex",
      exporter: "download-3 SpotiFLAC",
      endpoint: "/api/download/spotiflac",
      sourceUrl: url,
      sourceType: spotifyKind,
      profile: profile.id,
      requestedProfile,
      preview,
      trackCount: flacFiles.length,
      createdAtIso: new Date().toISOString(),
      enhancements,
      files: zipFiles.map((file) => file.path),
    }, null, 2));
    zipFiles.push({ path: "Turrex SpotiFLAC Export/manifest.json", filePath: manifestPath });

    await emit?.({ step: "zipping", progress: 90, message: "Packaging ZIP export..." });
    await writeZipFile(zipFiles, zipPath);
    const zipStats = await stat(zipPath).catch(() => null);
    if (!zipStats || zipStats.size === 0) throw new Error("ZIP packaging completed without a usable file.");

    return {
      requestId,
      tempDir,
      zipPath,
      fileName: preview ? "spotiflac-preview.zip" : "spotiflac-download.zip",
      profile: profile.id,
      sourceUrl: url,
      trackCount: flacFiles.length,
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
    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Length": String(buffer.byteLength),
        "Content-Disposition": `attachment; filename="${dispositionFileName(entry.fileName)}"`,
        "Cache-Control": "no-store",
      },
    });
  } finally {
    await rm(entry.tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  const action = request.nextUrl.searchParams.get("action");
  if (action === "retrieve") return handleRetrieve(request.nextUrl.searchParams.get("token"));
  if (action !== "status") return errorResponse("Unsupported SpotiFLAC GET action.", 400);

  const [spotiflac, ffmpeg, writable] = await Promise.allSettled([
    runProbe(spotiflacBinary(), ["--help"]),
    runProbe(ffmpegBinary(), ["-version"]),
    checkTempWritable(tmpdir()),
  ]);
  const spotiflacResult = spotiflac.status === "fulfilled" ? spotiflac.value : { available: false, error: "SpotiFLAC probe failed." };
  const ffmpegResult = ffmpeg.status === "fulfilled" ? ffmpeg.value : { available: false, error: "ffmpeg probe failed." };
  const writableResult = writable.status === "fulfilled" ? writable.value : false;

  return NextResponse.json({
    spotiflac: spotiflacResult,
    ffmpeg: ffmpegResult,
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
  const wantsSse = request.headers.get("accept")?.toLowerCase().includes("text/event-stream") ?? false;
  let body: SpotiflacRequestBody;
  try {
    body = await request.json() as SpotiflacRequestBody;
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
            const result = await processSpotiflacDownload(body, send);
            const token = crypto.randomUUID();
            tokenStore.set(token, {
              zipPath: result.zipPath,
              tempDir: result.tempDir,
              fileName: result.fileName,
              createdAt: Date.now(),
            });
            send({
              step: "complete",
              progress: 100,
              message: "ZIP download ready",
              token,
              file: `/api/download/spotiflac?action=retrieve&token=${encodeURIComponent(token)}`,
            });
          } catch (error) {
            send({ step: "error", progress: 100, message: messageFromUnknown(error) || "SpotiFLAC download failed." });
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
    result = await processSpotiflacDownload(body);
    const buffer = await readFile(result.zipPath);
    return new Response(buffer, { status: 200, headers: responseHeaders(result, buffer.byteLength) });
  } catch (error) {
    return errorResponse(messageFromUnknown(error) || "SpotiFLAC download failed.", statusFromError(error), { requestId: result?.requestId });
  } finally {
    if (result?.tempDir) await rm(result.tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
