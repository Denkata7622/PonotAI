import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { binaryFromLocation } from "./downloadDiagnostics";
import type { CoverCandidate, ResolvedTrackMetadata } from "./trackMetadata";
import { createSafeTrackFileName } from "./trackMetadata";
import {
  normalizeAudioPolishOptions,
  validatePostProcessingOptions as validateSharedPostProcessingOptions,
  usesAudioReencoding,
  type AudioPolishOptions,
  type DownloadPostProcessingOptions,
  type ExportAudioProfile,
  type LegacyLoudnessTarget,
  type AudioPolishValidationResult,
} from "./audioPolishTypes";
import {
  analyzeAudioFile,
  buildQualityPreservation,
  compareAudioAnalysis,
  type AudioAnalysis,
  type AudioComparison,
  type QualityPreservation,
} from "./audioQualityAnalysis";

export type { AudioPolishOptions, DownloadPostProcessingOptions } from "./audioPolishTypes";

export type LoudnessTarget = LegacyLoudnessTarget;

export type AudioProbe = {
  duration?: number;
  formatName?: string;
  codecName?: string;
  bitRate?: number;
  sampleRate?: number;
  channels?: number;
  hasAudio: boolean;
  hasCover: boolean;
  tags?: Record<string, string>;
};

export type LoudnessMeasurements = {
  measuredI?: number;
  measuredTP?: number;
  measuredLRA?: number;
  measuredThresh?: number;
  offset?: number;
};

export type TrackPostProcessingResult = {
  status: "skipped" | "metadata-only" | "normalized" | "failed-fallback-original";
  outputBytes: Uint8Array;
  filename: string;
  contentType: "audio/mpeg" | "audio/mp4" | "application/octet-stream";
  metadata: ResolvedTrackMetadata;
  cover: {
    attempted: boolean;
    embedded: boolean;
    source?: string;
    mimeType?: string;
    width?: number;
    height?: number;
    warnings: string[];
  };
  audio: {
    mode: "copy" | "normalized" | "processed" | "unknown";
    reencoded: boolean;
    loudness?: LoudnessMeasurements & LoudnessTarget & { passMode?: "single" | "two-pass" };
    probe?: AudioProbe;
    warnings: string[];
  };
  audioPolish: {
    mode: AudioPolishOptions["mode"];
    profile: ExportAudioProfile;
    reencoded: boolean;
    qualityPreservation?: QualityPreservation;
    analysis?: {
      before?: AudioAnalysis;
      after?: AudioAnalysis;
      comparison?: AudioComparison;
    };
    warnings: string[];
  };
  warnings: string[];
};

type ProcessRunResult = {
  code: number;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
};

export type ProcessRunner = (binary: string, args: string[], options: { cwd?: string; timeoutMs: number }) => Promise<ProcessRunResult>;

export type PostProcessAudioInput = {
  inputPath: string;
  tempDir: string;
  metadata: ResolvedTrackMetadata;
  options: DownloadPostProcessingOptions;
  originalBytes?: Uint8Array;
  ffmpegPath?: string;
  ffprobePath?: string;
  fetcher?: typeof fetch;
  runner?: ProcessRunner;
  timeoutMs?: number;
  assumeMp3Input?: boolean;
  sourceFileName?: string;
};

export function compactPostProcessingSummary(result: TrackPostProcessingResult): Record<string, unknown> {
  return {
    status: result.status,
    filename: result.filename,
    contentType: result.contentType,
    metadata: {
      title: result.metadata.title,
      artist: result.metadata.artist,
      album: result.metadata.album,
      albumArtist: result.metadata.albumArtist,
      date: result.metadata.date,
      year: result.metadata.year,
      genre: result.metadata.genre,
      source: result.metadata.source,
      confidence: result.metadata.confidence,
      cleanupApplied: result.metadata.cleanupApplied,
      warnings: result.metadata.warnings,
    },
    cover: {
      attempted: result.cover.attempted,
      embedded: result.cover.embedded,
      source: result.cover.source,
      mimeType: result.cover.mimeType,
      warningCount: result.cover.warnings.length,
      warnings: result.cover.warnings.slice(0, 3),
    },
    audio: {
      mode: result.audio.mode,
      reencoded: result.audio.reencoded,
      loudness: result.audio.loudness ? {
        integrated: result.audio.loudness.integrated,
        truePeak: result.audio.loudness.truePeak,
        lra: result.audio.loudness.lra,
        measuredI: result.audio.loudness.measuredI,
        measuredTP: result.audio.loudness.measuredTP,
        measuredLRA: result.audio.loudness.measuredLRA,
        measuredThresh: result.audio.loudness.measuredThresh,
        offset: result.audio.loudness.offset,
        passMode: result.audio.loudness.passMode,
      } : undefined,
      probe: result.audio.probe ? {
        duration: result.audio.probe.duration,
        formatName: result.audio.probe.formatName,
        codecName: result.audio.probe.codecName,
        bitRate: result.audio.probe.bitRate,
        sampleRate: result.audio.probe.sampleRate,
        channels: result.audio.probe.channels,
        hasAudio: result.audio.probe.hasAudio,
        hasCover: result.audio.probe.hasCover,
        tags: result.audio.probe.tags,
      } : undefined,
      warnings: result.audio.warnings,
    },
    audioPolish: {
      profile: result.audioPolish.profile,
      mode: result.audioPolish.mode,
      reencoded: result.audioPolish.reencoded,
      qualityPreservation: result.audioPolish.qualityPreservation,
      analysis: result.audioPolish.analysis ? {
        before: result.audioPolish.analysis.before,
        after: result.audioPolish.analysis.after,
        comparison: result.audioPolish.analysis.comparison ? {
          verdict: result.audioPolish.analysis.comparison.verdict,
          score: result.audioPolish.analysis.comparison.score,
          reasons: result.audioPolish.analysis.comparison.reasons.slice(0, 4),
          warnings: result.audioPolish.analysis.comparison.warnings.slice(0, 6),
        } : undefined,
      } : undefined,
      warnings: result.audioPolish.warnings.slice(0, 8),
    },
    warnings: result.warnings,
  };
}

export function encodePostProcessingHeader(result: TrackPostProcessingResult): string {
  return Buffer.from(JSON.stringify(compactPostProcessingSummary(result)), "utf8").toString("base64url");
}

const DEFAULT_PROCESS_TIMEOUT_MS = 180000;
const MAX_CAPTURE = 20000;
const COVER_MAX_BYTES = 5 * 1024 * 1024;
const COVER_TIMEOUT_MS = 12000;
const SUPPORTED_COVER_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

export function resolvePostProcessingOptions(value: unknown): DownloadPostProcessingOptions {
  return normalizeAudioPolishOptions(value);
}

export function validatePostProcessingOptions(value: unknown): AudioPolishValidationResult {
  return validateSharedPostProcessingOptions(value);
}

function capOutput(current: string, next: string): string {
  return (current + next).slice(-MAX_CAPTURE);
}

export const defaultProcessRunner: ProcessRunner = (binary, args, options) => new Promise((resolve, reject) => {
  let settled = false;
  let stdout = "";
  let stderr = "";
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout>;

  const finish = (fn: () => void) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    fn();
  };

  const child = spawn(binary, args, {
    cwd: options.cwd,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });

  timer = setTimeout(() => {
    timedOut = true;
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
    finish(() => resolve({ code: timedOut ? 124 : (code ?? 1), stdout, stderr, timedOut }));
  });
});

function safeMessage(message: string | undefined): string {
  return (message || "unknown error")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\b(token|secret|password|cookie|session|api[-_]?key|jwt)\s*[:=]\s*[^&\s"'`<>),;]+/gi, "$1=[redacted]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/(^|[\s"'`(])([A-Za-z]:[\\/][^\s"'`<>]+)/g, "$1[path]")
    .slice(0, 280);
}

function metadataArgs(metadata: ResolvedTrackMetadata): string[] {
  const pairs: Array<[string, string | number | undefined]> = [
    ["title", metadata.title],
    ["artist", metadata.artist],
    ["album", metadata.album],
    ["album_artist", metadata.albumArtist],
    ["date", metadata.date || metadata.year],
    ["genre", metadata.genre],
    ["track", metadata.trackNumber],
    ["disc", metadata.discNumber],
    ["comment", metadata.comment],
  ];
  return pairs.flatMap(([key, value]) => {
    if (value === undefined || value === null || value === "") return [];
    return ["-metadata", `${key}=${String(value)}`];
  });
}

export function buildLoudnormFilter(target: LoudnessTarget, measurements?: LoudnessMeasurements): string {
  const base = `loudnorm=I=${target.integrated}:TP=${target.truePeak}:LRA=${target.lra}`;
  if (!measurements || measurements.measuredI === undefined || measurements.measuredTP === undefined || measurements.measuredLRA === undefined || measurements.measuredThresh === undefined || measurements.offset === undefined) {
    return base;
  }
  return `${base}:measured_I=${measurements.measuredI}:measured_TP=${measurements.measuredTP}:measured_LRA=${measurements.measuredLRA}:measured_thresh=${measurements.measuredThresh}:offset=${measurements.offset}:linear=true:print_format=summary`;
}

const CONSERVATIVE_SILENCE_TRIM_FILTER = "silenceremove=start_periods=1:start_duration=0.4:start_threshold=-50dB:stop_periods=1:stop_duration=0.8:stop_threshold=-50dB";
const SAFETY_LIMITER_FILTER = "alimiter=limit=0.95";

export function buildAudioPolishFilter(input: {
  options: AudioPolishOptions;
  target: LoudnessTarget;
  measurements?: LoudnessMeasurements;
}): string | undefined {
  const filters: string[] = [];
  if (input.options.trimSilence) filters.push(CONSERVATIVE_SILENCE_TRIM_FILTER);
  if (input.options.mode === "normalize-loudness" || input.options.mode === "normalize-loudness-safe") {
    filters.push(buildLoudnormFilter(input.target, input.measurements));
  }
  if (input.options.mode === "normalize-loudness-safe" || (input.options.truePeakLimit && input.options.normalizeLoudness)) {
    filters.push(SAFETY_LIMITER_FILTER);
  }
  return filters.length ? filters.join(",") : undefined;
}

export function buildLoudnessAnalysisArgs(inputPath: string, target: LoudnessTarget): string[] {
  return [
    "-hide_banner",
    "-nostdin",
    "-i",
    inputPath,
    "-map",
    "0:a:0",
    "-af",
    `${buildLoudnormFilter(target)}:print_format=json`,
    "-f",
    "null",
    "-",
  ];
}

export function buildCoverJpegArgs(inputPath: string, outputPath: string): string[] {
  return [
    "-y",
    "-hide_banner",
    "-nostdin",
    "-i",
    inputPath,
    "-vf",
    "scale=w=1200:h=1200:force_original_aspect_ratio=decrease",
    "-frames:v",
    "1",
    "-q:v",
    "3",
    outputPath,
  ];
}

export type OutputContainer = "mp3" | "m4a";
export type AudioEncoder = "copy" | "mp3-lame" | "mp3-native" | "aac";

export type AudioExportPlan = {
  profile: ExportAudioProfile;
  outputContainer: OutputContainer;
  outputExtension: ".mp3" | ".m4a";
  outputCodec: "mp3" | "aac";
  encoder: AudioEncoder;
  audioStreamCopied: boolean;
  reencoded: boolean;
  transcodeReason: string;
  expectedContentType: "audio/mpeg" | "audio/mp4";
};

function normalizedCodec(value?: string): string | undefined {
  if (!value) return undefined;
  const codec = value.toLowerCase();
  if (codec.includes("aac")) return "aac";
  if (codec.includes("mp3") || codec.includes("mpga")) return "mp3";
  if (codec.includes("opus")) return "opus";
  if (codec.includes("vorbis")) return "vorbis";
  if (codec.includes("flac")) return "flac";
  if (codec.includes("pcm") || codec.includes("wav")) return "pcm";
  return codec;
}

export function planAudioExport(input: {
  profile: ExportAudioProfile;
  sourceCodec?: string;
  assumeMp3Input?: boolean;
  hasAudio?: boolean;
  requiresFilter?: boolean;
}): AudioExportPlan {
  const codec = normalizedCodec(input.sourceCodec) || (input.assumeMp3Input ? "mp3" : undefined);
  const requiresFilter = input.requiresFilter || input.profile === "phone-aac-normalized" || input.profile === "mp3-normalized";

  if (input.profile === "analysis-only") {
    return {
      profile: input.profile,
      outputContainer: codec === "aac" ? "m4a" : "mp3",
      outputExtension: codec === "aac" ? ".m4a" : ".mp3",
      outputCodec: codec === "aac" ? "aac" : "mp3",
      encoder: "copy",
      audioStreamCopied: true,
      reencoded: false,
      transcodeReason: "analysis-only preserves the original audio",
      expectedContentType: codec === "aac" ? "audio/mp4" : "audio/mpeg",
    };
  }

  if (input.profile === "phone-aac-normalized") {
    return {
      profile: input.profile,
      outputContainer: "m4a",
      outputExtension: ".m4a",
      outputCodec: "aac",
      encoder: "aac",
      audioStreamCopied: false,
      reencoded: true,
      transcodeReason: "loudness normalization requires filtering",
      expectedContentType: "audio/mp4",
    };
  }

  if (input.profile === "mp3-normalized") {
    return {
      profile: input.profile,
      outputContainer: "mp3",
      outputExtension: ".mp3",
      outputCodec: "mp3",
      encoder: "mp3-lame",
      audioStreamCopied: false,
      reencoded: true,
      transcodeReason: "loudness normalization requires filtering",
      expectedContentType: "audio/mpeg",
    };
  }

  if (input.profile === "phone-aac-preserve") {
    if (codec === "aac" && !requiresFilter) {
      return {
        profile: input.profile,
        outputContainer: "m4a",
        outputExtension: ".m4a",
        outputCodec: "aac",
        encoder: "copy",
        audioStreamCopied: true,
        reencoded: false,
        transcodeReason: "source AAC preserved for phone AAC profile",
        expectedContentType: "audio/mp4",
      };
    }
    if (codec === "mp3" && !requiresFilter) {
      return {
        profile: input.profile,
        outputContainer: "mp3",
        outputExtension: ".mp3",
        outputCodec: "mp3",
        encoder: "copy",
        audioStreamCopied: true,
        reencoded: false,
        transcodeReason: "source MP3 preserved to avoid lossy MP3-to-AAC transcode",
        expectedContentType: "audio/mpeg",
      };
    }
    return {
      profile: input.profile,
      outputContainer: "m4a",
      outputExtension: ".m4a",
      outputCodec: "aac",
      encoder: "aac",
      audioStreamCopied: false,
      reencoded: true,
      transcodeReason: codec === "opus" || codec === "vorbis"
        ? "converted Opus/Vorbis source to AAC for Samsung Music phone compatibility"
        : "converted source to AAC for phone-friendly M4A compatibility",
      expectedContentType: "audio/mp4",
    };
  }

  if (codec === "mp3" && !requiresFilter) {
    return {
      profile: "compatibility-mp3",
      outputContainer: "mp3",
      outputExtension: ".mp3",
      outputCodec: "mp3",
      encoder: "copy",
      audioStreamCopied: true,
      reencoded: false,
      transcodeReason: "source MP3 copied for compatibility",
      expectedContentType: "audio/mpeg",
    };
  }

  return {
    profile: "compatibility-mp3",
    outputContainer: "mp3",
    outputExtension: ".mp3",
    outputCodec: "mp3",
    encoder: "mp3-lame",
    audioStreamCopied: false,
    reencoded: true,
    transcodeReason: "converted source to MP3 for compatibility",
    expectedContentType: "audio/mpeg",
  };
}

export function buildPostProcessArgs(input: {
  inputPath: string;
  outputPath: string;
  metadata: ResolvedTrackMetadata;
  coverPath?: string;
  normalizeFilter?: string;
  audioFilter?: string;
  outputContainer?: OutputContainer;
  audioEncoder?: AudioEncoder;
}): string[] {
  const args = [
    "-y",
    "-hide_banner",
    "-nostdin",
    "-i",
    input.inputPath,
  ];
  if (input.coverPath) args.push("-i", input.coverPath);
  args.push("-map", "0:a:0");
  if (input.coverPath) args.push("-map", "1:v:0");
  args.push("-map_metadata", "-1", ...metadataArgs(input.metadata));
  if (input.coverPath) {
    args.push(
      "-metadata:s:v",
      "title=Album cover",
      "-metadata:s:v",
      "comment=Cover (Front)",
      "-disposition:v:0",
      "attached_pic",
    );
  }
  const audioFilter = input.audioFilter ?? input.normalizeFilter;
  const outputContainer = input.outputContainer ?? "mp3";
  const encoder = input.audioEncoder ?? (audioFilter ? "mp3-lame" : "copy");
  if (audioFilter) {
    args.push("-af", audioFilter);
  }
  if (outputContainer === "mp3") {
    args.push("-id3v2_version", "3", "-write_id3v1", "1");
  }
  if (encoder === "copy") {
    args.push("-c:a", "copy");
  } else if (encoder === "aac") {
    args.push("-c:a", "aac", "-b:a", "256k");
  } else if (encoder === "mp3-native") {
    args.push("-c:a", "mp3", "-b:a", "320k");
  } else {
    args.push("-c:a", "libmp3lame", "-q:a", "2");
  }
  if (input.coverPath) args.push("-c:v", "mjpeg");
  if (outputContainer === "m4a") args.push("-f", "mp4");
  args.push(input.outputPath);
  return args;
}

function withNativeMp3FallbackEncoder(args: string[]): string[] {
  const next = [...args];
  const encoderIndex = next.indexOf("libmp3lame");
  if (encoderIndex >= 0) next[encoderIndex] = "mp3";
  const qualityIndex = next.indexOf("-q:a");
  if (qualityIndex >= 0 && next[qualityIndex + 1] === "2") {
    next.splice(qualityIndex, 2, "-b:a", "320k");
  }
  return next;
}

export function buildFfprobeArgs(inputPath: string): string[] {
  return ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", inputPath];
}

function parseNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function parseLoudnormJson(output: string): LoudnessMeasurements | undefined {
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    const parsed = JSON.parse(output.slice(start, end + 1)) as Record<string, unknown>;
    return {
      measuredI: parseNumber(parsed.input_i),
      measuredTP: parseNumber(parsed.input_tp),
      measuredLRA: parseNumber(parsed.input_lra),
      measuredThresh: parseNumber(parsed.input_thresh),
      offset: parseNumber(parsed.target_offset),
    };
  } catch {
    return undefined;
  }
}

function normalizeTags(tags: unknown): Record<string, string> | undefined {
  if (!tags || typeof tags !== "object" || Array.isArray(tags)) return undefined;
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(tags as Record<string, unknown>)) {
    if (typeof value === "string" || typeof value === "number") result[key.toLowerCase()] = String(value);
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

export function parseFfprobeOutput(output: string): AudioProbe {
  const parsed = JSON.parse(output) as { format?: Record<string, unknown>; streams?: Array<Record<string, unknown>> };
  const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
  const audioStream = streams.find((stream) => stream.codec_type === "audio");
  const coverStream = streams.find((stream) => {
    const disposition = stream.disposition && typeof stream.disposition === "object" ? stream.disposition as Record<string, unknown> : {};
    return stream.codec_type === "video" && (disposition.attached_pic === 1 || disposition.attached_pic === "1");
  });
  const formatTags = normalizeTags(parsed.format?.tags);
  const streamTags = normalizeTags(audioStream?.tags);
  return {
    duration: parseNumber(parsed.format?.duration) || parseNumber(audioStream?.duration),
    formatName: typeof parsed.format?.format_name === "string" ? parsed.format.format_name : undefined,
    codecName: typeof audioStream?.codec_name === "string" ? audioStream.codec_name : undefined,
    bitRate: parseNumber(parsed.format?.bit_rate) || parseNumber(audioStream?.bit_rate),
    sampleRate: parseNumber(audioStream?.sample_rate),
    channels: parseNumber(audioStream?.channels),
    hasAudio: Boolean(audioStream),
    hasCover: Boolean(coverStream),
    tags: { ...(streamTags || {}), ...(formatTags || {}) },
  };
}

async function runOrThrow(runner: ProcessRunner, binary: string, args: string[], timeoutMs: number, cwd?: string): Promise<ProcessRunResult> {
  const result = await runner(binary, args, { cwd, timeoutMs });
  if (result.code !== 0) {
    throw new Error(result.timedOut ? "postprocess-timeout" : safeMessage(`${result.stderr}\n${result.stdout}`));
  }
  return result;
}

function extensionForMime(mimeType: string): string {
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  return ".jpg";
}

async function fetchCoverToFile(candidate: CoverCandidate, tempDir: string, fetcher: typeof fetch): Promise<{ path: string; mimeType: string; source: string; width?: number; height?: number }> {
  if (!candidate.url) throw new Error("cover candidate has no URL");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), COVER_TIMEOUT_MS);
  try {
    const response = await fetcher(candidate.url, { signal: controller.signal, cache: "no-store" });
    if (!response.ok) throw new Error(`cover-fetch-failed ${response.status}`);
    const mimeType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!SUPPORTED_COVER_MIME.has(mimeType)) throw new Error("cover-unsupported");
    const length = Number(response.headers.get("content-length") || 0);
    if (Number.isFinite(length) && length > COVER_MAX_BYTES) throw new Error("cover-too-large");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength <= 0) throw new Error("cover-empty");
    if (bytes.byteLength > COVER_MAX_BYTES) throw new Error("cover-too-large");
    const coverPath = path.join(tempDir, `cover-source${extensionForMime(mimeType)}`);
    await fs.writeFile(coverPath, bytes);
    return { path: coverPath, mimeType, source: candidate.source, width: candidate.width, height: candidate.height };
  } finally {
    clearTimeout(timer);
  }
}

async function prepareCover(input: PostProcessAudioInput, ffmpegPath: string, runner: ProcessRunner, coverWarnings: string[]): Promise<{ coverPath?: string; source?: string; mimeType?: string; width?: number; height?: number }> {
  if (!input.options.embedCover || input.metadata.coverCandidates.length === 0) return {};
  for (const candidate of input.metadata.coverCandidates) {
    try {
      const fetched = await fetchCoverToFile(candidate, input.tempDir, input.fetcher ?? fetch);
      const jpegPath = path.join(input.tempDir, "cover-embedded.jpg");
      await runOrThrow(runner, ffmpegPath, buildCoverJpegArgs(fetched.path, jpegPath), Math.min(input.timeoutMs ?? DEFAULT_PROCESS_TIMEOUT_MS, 60000), input.tempDir);
      return { coverPath: jpegPath, source: fetched.source, mimeType: "image/jpeg", width: fetched.width, height: fetched.height };
    } catch (error) {
      coverWarnings.push(safeMessage(error instanceof Error ? error.message : String(error)));
    }
  }
  return {};
}

function shouldSkipMetadataOnlyForInput(input: PostProcessAudioInput): boolean {
  void input;
  return false;
}

function sourceAudioExtension(input: PostProcessAudioInput): ".mp3" | ".m4a" | ".audio" {
  const ext = path.extname(input.sourceFileName || input.inputPath).toLowerCase();
  if (ext === ".mp3") return ".mp3";
  if (ext === ".m4a" || ext === ".mp4" || ext === ".aac") return ".m4a";
  return input.assumeMp3Input === false ? ".audio" : ".mp3";
}

function contentTypeForExtension(ext: ".mp3" | ".m4a" | ".audio"): TrackPostProcessingResult["contentType"] {
  if (ext === ".m4a") return "audio/mp4";
  if (ext === ".mp3") return "audio/mpeg";
  return "application/octet-stream";
}

export async function postProcessAudio(input: PostProcessAudioInput): Promise<TrackPostProcessingResult> {
  const warnings: string[] = [];
  const coverWarnings: string[] = [];
  const audioWarnings: string[] = [];
  const audioPolishWarnings: string[] = [];
  const originalBytes = input.originalBytes ?? await fs.readFile(input.inputPath);
  let originalAnalysis: AudioAnalysis | undefined;

  const fallback = async (reason: string, processedAnalysis?: AudioAnalysis): Promise<TrackPostProcessingResult> => {
    const comparison = originalAnalysis && processedAnalysis
      ? compareAudioAnalysis(originalAnalysis, processedAnalysis, input.options.audioPolish)
      : undefined;
    const polishWarnings = Array.from(new Set([
      ...audioPolishWarnings,
      ...(originalAnalysis?.warnings ?? []),
      ...(processedAnalysis?.warnings ?? []),
      ...(comparison?.warnings ?? []),
      reason,
      "audio-polish-fallback-original",
    ]));
    return {
      status: "failed-fallback-original",
      outputBytes: originalBytes,
      filename: createSafeTrackFileName(input.metadata, sourceAudioExtension(input)),
      contentType: contentTypeForExtension(sourceAudioExtension(input)),
      metadata: input.metadata,
      cover: { attempted: input.options.embedCover && input.metadata.coverCandidates.length > 0, embedded: false, warnings: coverWarnings },
      audio: { mode: "unknown", reencoded: false, warnings: [...audioWarnings, reason] },
      audioPolish: {
        profile: input.options.audioPolish.profile,
        mode: input.options.audioPolish.mode,
        reencoded: false,
        analysis: originalAnalysis || processedAnalysis ? {
          before: originalAnalysis,
          after: processedAnalysis,
          comparison,
        } : undefined,
        warnings: polishWarnings,
      },
      warnings: Array.from(new Set([...warnings, reason])),
    };
  };

  const reencodesAudio = usesAudioReencoding(input.options);

  if (!input.options.cleanMetadata && !input.options.embedCover && !reencodesAudio && input.options.audioPolish.mode !== "analyze-only") {
    return {
      status: "skipped",
      outputBytes: originalBytes,
      filename: createSafeTrackFileName(input.metadata, sourceAudioExtension(input)),
      contentType: contentTypeForExtension(sourceAudioExtension(input)),
      metadata: input.metadata,
      cover: { attempted: false, embedded: false, warnings: [] },
      audio: { mode: "unknown", reencoded: false, warnings: ["Post-processing disabled."] },
      audioPolish: {
        profile: input.options.audioPolish.profile,
        mode: input.options.audioPolish.mode,
        reencoded: false,
        warnings: ["Post-processing disabled."],
      },
      warnings: ["Post-processing disabled."],
    };
  }

  if (shouldSkipMetadataOnlyForInput(input)) {
    return {
      status: "skipped",
      outputBytes: originalBytes,
      filename: createSafeTrackFileName(input.metadata, ".audio"),
      contentType: "application/octet-stream",
      metadata: input.metadata,
      cover: { attempted: false, embedded: false, warnings: ["Direct non-MP3 audio was preserved without embedded tags."] },
      audio: { mode: "unknown", reencoded: false, warnings: ["Direct non-MP3 audio was preserved without re-encoding."] },
      audioPolish: {
        profile: input.options.audioPolish.profile,
        mode: input.options.audioPolish.mode,
        reencoded: false,
        warnings: ["Direct non-MP3 audio was preserved without re-encoding."],
      },
      warnings: ["Direct non-MP3 audio was preserved without re-encoding."],
    };
  }

  const runner = input.runner ?? defaultProcessRunner;
  const ffmpegPath = input.ffmpegPath || binaryFromLocation(process.env.FFMPEG_LOCATION, "ffmpeg");
  const ffprobePath = input.ffprobePath || binaryFromLocation(process.env.FFMPEG_LOCATION, "ffprobe");
  const timeoutMs = input.timeoutMs ?? DEFAULT_PROCESS_TIMEOUT_MS;

  try {
    if (input.options.audioPolish.analyzeBeforeAfter) {
      originalAnalysis = await analyzeAudioFile({
        inputPath: input.inputPath,
        ffmpegPath,
        ffprobePath,
        runner,
        timeoutMs,
        cwd: input.tempDir,
        target: input.options.audioPolish.loudnessTarget,
        includeSilence: input.options.audioPolish.trimSilence,
      });
      audioPolishWarnings.push(...originalAnalysis.warnings);
    } else {
      try {
        const probeRun = await runOrThrow(runner, ffprobePath, buildFfprobeArgs(input.inputPath), Math.min(timeoutMs, 60000), input.tempDir);
        const probe = parseFfprobeOutput(probeRun.stdout);
        originalAnalysis = {
          durationSec: probe.duration,
          formatName: probe.formatName,
          codecName: probe.codecName,
          bitRate: probe.bitRate,
          sampleRate: probe.sampleRate,
          channels: probe.channels,
          hasAudio: probe.hasAudio,
          warnings: probe.hasAudio ? [] : ["audio-codec-missing"],
        };
      } catch (error) {
        audioPolishWarnings.push(`audio-analysis-failed: ${safeMessage(error instanceof Error ? error.message : String(error))}`);
      }
    }

    if (input.options.audioPolish.mode === "analyze-only") {
      return {
        status: "skipped",
        outputBytes: originalBytes,
        filename: createSafeTrackFileName(input.metadata, sourceAudioExtension(input)),
        contentType: contentTypeForExtension(sourceAudioExtension(input)),
        metadata: input.metadata,
        cover: { attempted: false, embedded: false, warnings: ["Analyze-only mode preserved the original audio without writing tags."] },
        audio: { mode: "copy", reencoded: false, warnings: ["Analyze-only mode preserved the original audio."] },
        audioPolish: {
          profile: input.options.audioPolish.profile,
          mode: "analyze-only",
          reencoded: false,
          analysis: originalAnalysis ? {
            before: originalAnalysis,
            after: originalAnalysis,
            comparison: compareAudioAnalysis(originalAnalysis, originalAnalysis, input.options.audioPolish),
          } : undefined,
          warnings: Array.from(new Set(audioPolishWarnings)),
        },
        warnings: Array.from(new Set([...warnings, ...input.metadata.warnings])),
      };
    }

    const cover = await prepareCover(input, ffmpegPath, runner, coverWarnings);
    if (input.options.embedCover && input.metadata.coverCandidates.length > 0 && !cover.coverPath) warnings.push("Cover art was unavailable or could not be embedded.");

    const exportPlan = planAudioExport({
      profile: input.options.audioPolish.profile,
      sourceCodec: originalAnalysis?.codecName,
      assumeMp3Input: input.assumeMp3Input,
      hasAudio: originalAnalysis?.hasAudio,
      requiresFilter: reencodesAudio,
    });
    const audioWasReencoded = exportPlan.reencoded;
    let audioFilter: string | undefined;
    let loudness: TrackPostProcessingResult["audio"]["loudness"];
    if (input.options.normalizeLoudness) {
      try {
        const analysis = await runOrThrow(runner, ffmpegPath, buildLoudnessAnalysisArgs(input.inputPath, input.options.loudnessTarget), Math.min(timeoutMs, 180000), input.tempDir);
        const measurements = parseLoudnormJson(`${analysis.stderr}\n${analysis.stdout}`);
        if (measurements?.measuredI !== undefined) {
          audioFilter = buildAudioPolishFilter({
            options: input.options.audioPolish,
            target: input.options.loudnessTarget,
            measurements,
          });
          loudness = { ...input.options.loudnessTarget, ...measurements, passMode: "two-pass" };
        } else {
          audioWarnings.push("Loudness analysis did not return measurements; using single-pass normalization.");
          audioPolishWarnings.push("loudness-analysis-failed-two-pass-fallback-single-pass");
          audioFilter = buildAudioPolishFilter({
            options: input.options.audioPolish,
            target: input.options.loudnessTarget,
          });
          loudness = { ...input.options.loudnessTarget, passMode: "single" };
        }
      } catch (error) {
        audioWarnings.push(`Loudness analysis failed; using single-pass normalization. ${safeMessage(error instanceof Error ? error.message : String(error))}`);
        audioPolishWarnings.push("loudness-analysis-failed-two-pass-fallback-single-pass");
        audioFilter = buildAudioPolishFilter({
          options: input.options.audioPolish,
          target: input.options.loudnessTarget,
        });
        loudness = { ...input.options.loudnessTarget, passMode: "single" };
      }
    } else if (input.options.audioPolish.trimSilence) {
      audioFilter = buildAudioPolishFilter({
        options: input.options.audioPolish,
        target: input.options.loudnessTarget,
      });
      audioWarnings.push("Trimmed leading/trailing silence; audio was re-encoded.");
      audioPolishWarnings.push("silence-trim-enabled");
    }

    const outputPath = path.join(input.tempDir, audioWasReencoded ? `postprocessed-polished${exportPlan.outputExtension}` : `postprocessed-tagged${exportPlan.outputExtension}`);
    const finalArgs = buildPostProcessArgs({
      inputPath: input.inputPath,
      outputPath,
      metadata: input.metadata,
      coverPath: cover.coverPath,
      audioFilter,
      outputContainer: exportPlan.outputContainer,
      audioEncoder: exportPlan.encoder,
    });
    try {
      await runOrThrow(runner, ffmpegPath, finalArgs, timeoutMs, input.tempDir);
    } catch (error) {
      if (exportPlan.encoder !== "mp3-lame") throw error;
      audioWarnings.push(`libmp3lame audio polish command failed; retrying native MP3 encoder. ${safeMessage(error instanceof Error ? error.message : String(error))}`);
      await runOrThrow(runner, ffmpegPath, withNativeMp3FallbackEncoder(finalArgs), timeoutMs, input.tempDir);
    }

    const probeRun = await runOrThrow(runner, ffprobePath, buildFfprobeArgs(outputPath), Math.min(timeoutMs, 60000), input.tempDir);
    const probe = parseFfprobeOutput(probeRun.stdout);
    if (!probe.hasAudio || !probe.duration || probe.duration <= 0) {
      return fallback(!probe.hasAudio ? "ffprobe-verification-failed: output has no audio stream." : "ffprobe-verification-failed: output duration is invalid.");
    }

    const outputBytes = await fs.readFile(outputPath);
    if (outputBytes.byteLength <= 0) return fallback("postprocess-output-empty");

    let processedAnalysis: AudioAnalysis | undefined;
    let comparison: AudioComparison | undefined;
    if (input.options.audioPolish.analyzeBeforeAfter) {
      processedAnalysis = await analyzeAudioFile({
        inputPath: outputPath,
        ffmpegPath,
        ffprobePath,
        runner,
        timeoutMs,
        cwd: input.tempDir,
        target: input.options.audioPolish.loudnessTarget,
        includeSilence: input.options.audioPolish.trimSilence,
      });
      audioPolishWarnings.push(...processedAnalysis.warnings);
      if (originalAnalysis) {
        comparison = compareAudioAnalysis(originalAnalysis, processedAnalysis, input.options.audioPolish);
        audioPolishWarnings.push(...comparison.warnings);
        if (comparison.verdict === "worse") {
          audioWarnings.push("Audio comparison flagged the processed output as worse; exported output passed playback verification but needs review.");
        }
      }
    }

    const qualityPreservation = buildQualityPreservation({
      profile: input.options.audioPolish.profile,
      before: originalAnalysis,
      after: processedAnalysis,
      outputExtension: exportPlan.outputExtension,
      outputCodec: probe.codecName || exportPlan.outputCodec,
      outputContainer: probe.formatName || exportPlan.outputContainer,
      audioStreamCopied: exportPlan.audioStreamCopied,
      reencoded: exportPlan.reencoded,
      transcodeReason: exportPlan.transcodeReason,
      coverEmbedded: Boolean(cover.coverPath && probe.hasCover),
      coverExpected: input.options.embedCover && input.metadata.coverCandidates.length > 0,
      comparison,
    });
    audioPolishWarnings.push(...qualityPreservation.warnings);

    const status = input.options.normalizeLoudness ? "normalized" : "metadata-only";
    const audioMode: TrackPostProcessingResult["audio"]["mode"] = input.options.normalizeLoudness
      ? "normalized"
      : audioWasReencoded
        ? "processed"
        : "copy";
    const audioStatusWarnings = input.options.normalizeLoudness
      ? [
        ...audioWarnings,
        input.options.audioPolish.mode === "normalize-loudness-safe" ? "Normalized loudness with safety limiter; audio was re-encoded." : "Normalized loudness; audio was re-encoded.",
      ]
      : audioWasReencoded
        ? [...audioWarnings, exportPlan.transcodeReason]
        : [...audioWarnings, exportPlan.transcodeReason];

    return {
      status,
      outputBytes,
      filename: createSafeTrackFileName(input.metadata, exportPlan.outputExtension),
      contentType: exportPlan.expectedContentType,
      metadata: input.metadata,
      cover: {
        attempted: input.options.embedCover && input.metadata.coverCandidates.length > 0,
        embedded: Boolean(cover.coverPath && probe.hasCover),
        source: cover.source,
        mimeType: cover.mimeType,
        width: cover.width,
        height: cover.height,
        warnings: coverWarnings,
      },
      audio: {
        mode: audioMode,
        reencoded: audioWasReencoded,
        loudness,
        probe,
        warnings: audioStatusWarnings,
      },
      audioPolish: {
        profile: input.options.audioPolish.profile,
        mode: input.options.audioPolish.mode,
        reencoded: audioWasReencoded,
        qualityPreservation,
        analysis: originalAnalysis || processedAnalysis || comparison ? {
          before: originalAnalysis,
          after: processedAnalysis,
          comparison,
        } : undefined,
        warnings: Array.from(new Set(audioPolishWarnings)),
      },
      warnings: Array.from(new Set([...warnings, ...input.metadata.warnings])),
    };
  } catch (error) {
    return fallback(`metadata-processing-failed: ${safeMessage(error instanceof Error ? error.message : String(error))}`);
  }
}
