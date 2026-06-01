import { promises as fs } from "node:fs";
import type { AudioPolishOptions, AudioPolishTarget, ExportAudioProfile } from "./audioPolishTypes";

export type AudioAnalysis = {
  durationSec?: number;
  formatName?: string;
  codecName?: string;
  bitRate?: number;
  sampleRate?: number;
  channels?: number;
  fileSizeBytes?: number;
  hasAudio?: boolean;
  loudness?: {
    integratedLufs?: number;
    truePeakDb?: number;
    loudnessRangeLra?: number;
    thresholdDb?: number;
  };
  peaks?: {
    maxVolumeDb?: number;
    meanVolumeDb?: number;
  };
  silence?: {
    leadingSilenceSec?: number;
    trailingSilenceSec?: number;
    detected?: boolean;
  };
  warnings: string[];
};

export type AudioComparison = {
  before: AudioAnalysis;
  after: AudioAnalysis;
  score: {
    overall: number;
    volumeConsistency: number;
    clippingSafety: number;
    preservation: number;
  };
  verdict: "improved" | "neutral" | "worse" | "unknown";
  reasons: string[];
  warnings: string[];
};

export type ProfileQualityVerdict =
  | "preserved-best"
  | "improved-volume-consistency"
  | "compatible-transcode"
  | "neutral"
  | "worse"
  | "unknown";

export type QualityPreservation = {
  profile: ExportAudioProfile;
  sourceCodec?: string;
  sourceContainer?: string;
  outputCodec?: string;
  outputContainer?: string;
  outputExtension: ".mp3" | ".m4a" | ".audio";
  audioStreamCopied: boolean;
  reencoded: boolean;
  transcodeReason: string;
  transcodeCount: number;
  lossyToLossyTranscode: boolean;
  generationLossRisk: "none" | "low" | "medium" | "high";
  codecCompatibility: "excellent" | "good" | "warning" | "unknown";
  samsungMusicFriendly: boolean;
  bluetoothFriendly: boolean;
  phoneProfileScore: number;
  verdict: ProfileQualityVerdict;
  warnings: string[];
};

export type AudioAnalysisRunner = (
  binary: string,
  args: string[],
  options: { cwd?: string; timeoutMs: number },
) => Promise<{ code: number; stdout: string; stderr: string; timedOut?: boolean }>;

export type AnalyzeAudioFileInput = {
  inputPath: string;
  ffmpegPath?: string;
  ffprobePath?: string;
  runner: AudioAnalysisRunner;
  timeoutMs: number;
  cwd?: string;
  target: AudioPolishTarget;
  includeSilence?: boolean;
};

function parseNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function round(value: number | undefined, digits = 2): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function safeWarning(message: string): string {
  return message
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\b(token|secret|password|cookie|session|api[-_]?key|jwt)\s*[:=]\s*[^&\s"'`<>),;]+/gi, "$1=[redacted]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/(^|[\s"'`(])([A-Za-z]:[\\/][^\s"'`<>]+)/g, "$1[path]")
    .slice(0, 220);
}

export function buildAudioFfprobeArgs(inputPath: string): string[] {
  return ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", inputPath];
}

export function buildLoudnormAnalysisArgs(inputPath: string, target: AudioPolishTarget): string[] {
  return [
    "-hide_banner",
    "-nostdin",
    "-i",
    inputPath,
    "-map",
    "0:a:0",
    "-af",
    `loudnorm=I=${target.integratedLufs}:TP=${target.truePeakDb}:LRA=${target.loudnessRangeLra}:print_format=json`,
    "-f",
    "null",
    "-",
  ];
}

export function buildVolumedetectArgs(inputPath: string): string[] {
  return ["-hide_banner", "-nostdin", "-i", inputPath, "-map", "0:a:0", "-af", "volumedetect", "-f", "null", "-"];
}

export function buildSilencedetectArgs(inputPath: string): string[] {
  return ["-hide_banner", "-nostdin", "-i", inputPath, "-map", "0:a:0", "-af", "silencedetect=noise=-50dB:d=0.3", "-f", "null", "-"];
}

export function parseLoudnormAnalysis(output: string): AudioAnalysis["loudness"] | undefined {
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    const parsed = JSON.parse(output.slice(start, end + 1)) as Record<string, unknown>;
    const loudness = {
      integratedLufs: round(parseNumber(parsed.input_i)),
      truePeakDb: round(parseNumber(parsed.input_tp)),
      loudnessRangeLra: round(parseNumber(parsed.input_lra)),
      thresholdDb: round(parseNumber(parsed.input_thresh)),
    };
    return Object.values(loudness).some((value) => value !== undefined) ? loudness : undefined;
  } catch {
    return undefined;
  }
}

export function parseVolumedetectOutput(output: string): AudioAnalysis["peaks"] | undefined {
  const mean = output.match(/mean_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/i);
  const max = output.match(/max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/i);
  const peaks = {
    meanVolumeDb: round(parseNumber(mean?.[1])),
    maxVolumeDb: round(parseNumber(max?.[1])),
  };
  return peaks.meanVolumeDb !== undefined || peaks.maxVolumeDb !== undefined ? peaks : undefined;
}

export function parseSilencedetectOutput(output: string, durationSec?: number): AudioAnalysis["silence"] | undefined {
  const starts = Array.from(output.matchAll(/silence_start:\s*(-?\d+(?:\.\d+)?)/gi)).map((match) => Number(match[1]));
  const ends = Array.from(output.matchAll(/silence_end:\s*(-?\d+(?:\.\d+)?)(?:\s*\|\s*silence_duration:\s*(-?\d+(?:\.\d+)?))?/gi)).map((match) => ({
    end: Number(match[1]),
    duration: parseNumber(match[2]),
  }));
  if (starts.length === 0 && ends.length === 0) return { detected: false };

  let leadingSilenceSec: number | undefined;
  if (starts[0] !== undefined && starts[0] <= 0.05 && ends[0]?.end !== undefined) {
    leadingSilenceSec = Math.max(0, ends[0].end);
  }

  let trailingSilenceSec: number | undefined;
  if (durationSec !== undefined && starts.length > 0) {
    const lastStart = starts[starts.length - 1];
    const lastEnd = starts.length > ends.length ? undefined : ends[ends.length - 1]?.end;
    if (lastStart !== undefined && (lastEnd === undefined || Math.abs(lastEnd - durationSec) <= 0.75 || lastEnd >= durationSec)) {
      trailingSilenceSec = Math.max(0, durationSec - lastStart);
    }
  }

  return {
    detected: true,
    leadingSilenceSec: round(leadingSilenceSec),
    trailingSilenceSec: round(trailingSilenceSec),
  };
}

export function parseFfprobeAnalysis(output: string, fileSizeBytes?: number): AudioAnalysis {
  try {
    const parsed = JSON.parse(output) as { format?: Record<string, unknown>; streams?: Array<Record<string, unknown>> };
    const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
    const audioStream = streams.find((stream) => stream.codec_type === "audio");
    const duration = parseNumber(parsed.format?.duration) ?? parseNumber(audioStream?.duration);
    return {
      durationSec: round(duration, 3),
      formatName: typeof parsed.format?.format_name === "string" ? parsed.format.format_name : undefined,
      codecName: typeof audioStream?.codec_name === "string" ? audioStream.codec_name : undefined,
      bitRate: parseNumber(parsed.format?.bit_rate) ?? parseNumber(audioStream?.bit_rate),
      sampleRate: parseNumber(audioStream?.sample_rate),
      channels: parseNumber(audioStream?.channels),
      fileSizeBytes,
      hasAudio: Boolean(audioStream),
      warnings: audioStream ? [] : ["audio-codec-missing"],
    };
  } catch {
    return { fileSizeBytes, hasAudio: false, warnings: ["ffprobe-json-invalid"] };
  }
}

async function runAnalysisStep(
  runner: AudioAnalysisRunner,
  binary: string | undefined,
  args: string[],
  timeoutMs: number,
  cwd: string | undefined,
  warningCode: string,
): Promise<{ output?: string; warning?: string }> {
  if (!binary) return { warning: `${warningCode}: binary unavailable` };
  try {
    const result = await runner(binary, args, { cwd, timeoutMs });
    if (result.code !== 0) {
      return { warning: `${warningCode}: ${result.timedOut ? "audio-polish-timeout" : safeWarning(`${result.stderr}\n${result.stdout}`)}` };
    }
    return { output: `${result.stderr}\n${result.stdout}` };
  } catch (error) {
    return { warning: `${warningCode}: ${safeWarning(error instanceof Error ? error.message : String(error))}` };
  }
}

export async function analyzeAudioFile(input: AnalyzeAudioFileInput): Promise<AudioAnalysis> {
  const warnings: string[] = [];
  let fileSizeBytes: number | undefined;
  try {
    fileSizeBytes = (await fs.stat(input.inputPath)).size;
  } catch {
    warnings.push("audio-file-size-unavailable");
  }

  let analysis: AudioAnalysis = { fileSizeBytes, warnings: [] };
  const ffprobe = await runAnalysisStep(
    input.runner,
    input.ffprobePath,
    buildAudioFfprobeArgs(input.inputPath),
    Math.min(input.timeoutMs, 60000),
    input.cwd,
    "ffprobe-analysis-failed",
  );
  if (ffprobe.output) analysis = { ...analysis, ...parseFfprobeAnalysis(ffprobe.output, fileSizeBytes) };
  if (ffprobe.warning) warnings.push(ffprobe.warning);

  const loudnorm = await runAnalysisStep(
    input.runner,
    input.ffmpegPath,
    buildLoudnormAnalysisArgs(input.inputPath, input.target),
    Math.min(input.timeoutMs, 180000),
    input.cwd,
    "loudness-analysis-failed",
  );
  if (loudnorm.output) {
    const loudness = parseLoudnormAnalysis(loudnorm.output);
    if (loudness) analysis.loudness = loudness;
    else warnings.push("loudness-analysis-unavailable");
  }
  if (loudnorm.warning) warnings.push(loudnorm.warning);

  const volume = await runAnalysisStep(
    input.runner,
    input.ffmpegPath,
    buildVolumedetectArgs(input.inputPath),
    Math.min(input.timeoutMs, 90000),
    input.cwd,
    "volume-analysis-failed",
  );
  if (volume.output) {
    const peaks = parseVolumedetectOutput(volume.output);
    if (peaks) analysis.peaks = peaks;
    else warnings.push("volume-analysis-unavailable");
  }
  if (volume.warning) warnings.push(volume.warning);

  if (input.includeSilence) {
    const silence = await runAnalysisStep(
      input.runner,
      input.ffmpegPath,
      buildSilencedetectArgs(input.inputPath),
      Math.min(input.timeoutMs, 90000),
      input.cwd,
      "silence-analysis-failed",
    );
    if (silence.output) analysis.silence = parseSilencedetectOutput(silence.output, analysis.durationSec);
    if (silence.warning) warnings.push(silence.warning);
  }

  return {
    ...analysis,
    warnings: Array.from(new Set([...(analysis.warnings ?? []), ...warnings])),
  };
}

function loudnessDistance(analysis: AudioAnalysis, target: AudioPolishTarget): number | undefined {
  const value = analysis.loudness?.integratedLufs;
  return value === undefined ? undefined : Math.abs(value - target.integratedLufs);
}

function scoreVolumeConsistency(before: AudioAnalysis, after: AudioAnalysis, target: AudioPolishTarget): number {
  const beforeDistance = loudnessDistance(before, target);
  const afterDistance = loudnessDistance(after, target);
  if (afterDistance === undefined) return 50;
  const targetScore = 100 - Math.min(100, afterDistance * 14);
  if (beforeDistance === undefined) return targetScore;
  const improvement = Math.max(-20, Math.min(20, (beforeDistance - afterDistance) * 5));
  return clampScore(targetScore + improvement);
}

function scoreClippingSafety(after: AudioAnalysis, target: AudioPolishTarget): number {
  const truePeak = after.loudness?.truePeakDb;
  const maxVolume = after.peaks?.maxVolumeDb;
  if (truePeak === undefined && maxVolume === undefined) return 60;
  let score = 100;
  if (truePeak !== undefined && truePeak > target.truePeakDb + 0.3) score -= Math.min(70, (truePeak - target.truePeakDb) * 25);
  if (maxVolume !== undefined && maxVolume > -0.1) score -= 35;
  return clampScore(score);
}

function scorePreservation(before: AudioAnalysis, after: AudioAnalysis, trimSilence: boolean): { score: number; warnings: string[] } {
  const warnings: string[] = [];
  if (after.hasAudio === false || !after.codecName) {
    return { score: 0, warnings: ["audio-codec-missing"] };
  }
  let score = 100;
  if (before.durationSec && after.durationSec) {
    const ratio = Math.abs(after.durationSec - before.durationSec) / before.durationSec;
    if (!trimSilence && ratio > 0.2) {
      warnings.push("duration-changed-too-much");
      score -= 80;
    } else if (!trimSilence && ratio > 0.02) {
      score -= 25;
    } else if (trimSilence && ratio > 0.2) {
      warnings.push("duration-changed-too-much");
      score -= 45;
    }
  }
  if (before.sampleRate && after.sampleRate && before.sampleRate !== after.sampleRate) score -= 15;
  if (before.channels && after.channels && before.channels !== after.channels) score -= 15;
  if (before.bitRate && after.bitRate && after.bitRate < before.bitRate * 0.55) score -= 20;
  return { score: clampScore(score), warnings };
}

export function compareAudioAnalysis(before: AudioAnalysis, after: AudioAnalysis, options: AudioPolishOptions): AudioComparison {
  const warnings = Array.from(new Set([...(before.warnings ?? []), ...(after.warnings ?? [])]));
  const reasons: string[] = [];

  if (after.hasAudio === false) {
    return {
      before,
      after,
      score: { overall: 0, volumeConsistency: 0, clippingSafety: 0, preservation: 0 },
      verdict: "worse",
      reasons: ["Processed output did not contain a readable audio stream."],
      warnings: Array.from(new Set([...warnings, "audio-codec-missing"])),
    };
  }

  const volumeConsistency = scoreVolumeConsistency(before, after, options.loudnessTarget);
  const clippingSafety = scoreClippingSafety(after, options.loudnessTarget);
  const preservationResult = scorePreservation(before, after, options.trimSilence);
  const preservation = preservationResult.score;
  const allWarnings = Array.from(new Set([...warnings, ...preservationResult.warnings]));
  const overall = clampScore((volumeConsistency * 0.45) + (clippingSafety * 0.30) + (preservation * 0.25));

  const beforeDistance = loudnessDistance(before, options.loudnessTarget);
  const afterDistance = loudnessDistance(after, options.loudnessTarget);
  if (beforeDistance !== undefined && afterDistance !== undefined) {
    if (afterDistance + 0.5 < beforeDistance) reasons.push(`Integrated loudness moved closer to ${options.loudnessTarget.integratedLufs} LUFS.`);
    else if (Math.abs(afterDistance - beforeDistance) <= 0.5) reasons.push("Integrated loudness was already close to the target.");
    else reasons.push("Integrated loudness moved farther from the target.");
  } else {
    allWarnings.push("audio-comparison-unavailable");
  }
  if (clippingSafety >= 85) reasons.push("Peak metrics stayed within the configured safety range.");
  if (preservation >= 85) reasons.push("Duration, channels, and sample rate were preserved.");

  if (options.mode === "metadata-only" || options.mode === "analyze-only") {
    return {
      before,
      after,
      score: { overall: preservation, volumeConsistency, clippingSafety, preservation },
      verdict: preservation < 50 ? "worse" : "neutral",
      reasons: reasons.length ? reasons : ["Audio stream was preserved without loudness processing."],
      warnings: Array.from(new Set(allWarnings)),
    };
  }

  let verdict: AudioComparison["verdict"] = "unknown";
  if (preservation < 50 || allWarnings.includes("duration-changed-too-much") || allWarnings.includes("audio-codec-missing")) verdict = "worse";
  else if (afterDistance !== undefined && beforeDistance !== undefined && afterDistance + 1 < beforeDistance && clippingSafety >= 70) verdict = "improved";
  else if (overall >= 65) verdict = "neutral";

  if (after.loudness?.truePeakDb !== undefined && after.loudness.truePeakDb > options.loudnessTarget.truePeakDb + 0.3) {
    allWarnings.push("clipping-risk-detected");
  }

  return {
    before,
    after,
    score: { overall, volumeConsistency, clippingSafety, preservation },
    verdict,
    reasons,
    warnings: Array.from(new Set(allWarnings)),
  };
}

const LOSSY_CODECS = new Set(["aac", "mp3", "opus", "vorbis"]);
const PHONE_FRIENDLY_CODECS = new Set(["aac", "mp3", "flac"]);

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

function normalizedContainer(value?: string): string | undefined {
  if (!value) return undefined;
  const container = value.toLowerCase();
  if (container.includes("mp3")) return "mp3";
  if (container.includes("mov") || container.includes("mp4") || container.includes("m4a")) return "m4a";
  if (container.includes("webm") || container.includes("matroska")) return "webm";
  if (container.includes("ogg")) return "ogg";
  if (container.includes("flac")) return "flac";
  if (container.includes("wav")) return "wav";
  return container;
}

export function buildQualityPreservation(input: {
  profile: ExportAudioProfile;
  before?: AudioAnalysis;
  after?: AudioAnalysis;
  outputExtension: ".mp3" | ".m4a" | ".audio";
  outputCodec?: string;
  outputContainer?: string;
  audioStreamCopied: boolean;
  reencoded: boolean;
  transcodeReason: string;
  coverEmbedded?: boolean;
  coverExpected?: boolean;
  comparison?: AudioComparison;
}): QualityPreservation {
  const sourceCodec = normalizedCodec(input.before?.codecName);
  const outputCodec = normalizedCodec(input.outputCodec);
  const sourceContainer = normalizedContainer(input.before?.formatName);
  const outputContainer = normalizedContainer(input.outputContainer);
  const lossyToLossyTranscode = Boolean(input.reencoded && sourceCodec && outputCodec && LOSSY_CODECS.has(sourceCodec) && LOSSY_CODECS.has(outputCodec));
  const samsungMusicFriendly = outputCodec ? PHONE_FRIENDLY_CODECS.has(outputCodec) : false;
  const bluetoothFriendly = outputCodec === "aac" || outputCodec === "mp3";
  const codecCompatibility: QualityPreservation["codecCompatibility"] = samsungMusicFriendly && bluetoothFriendly
    ? "excellent"
    : samsungMusicFriendly
      ? "good"
      : outputCodec
        ? "warning"
        : "unknown";
  const warnings: string[] = [];

  if (input.after?.hasAudio === false) warnings.push("audio-codec-missing");
  if (input.coverExpected && !input.coverEmbedded) warnings.push("cover-embed-unverified");
  if (lossyToLossyTranscode && input.profile === "phone-aac-preserve" && sourceCodec === "mp3" && outputCodec === "aac") warnings.push("unnecessary-lossy-transcode-risk");
  if (input.comparison?.warnings.length) warnings.push(...input.comparison.warnings);

  let score = 0;
  if (input.audioStreamCopied) score += 35;
  else if (input.reencoded && input.profile.includes("normalized")) score += 18;
  else if (input.reencoded) score += 12;
  if (samsungMusicFriendly) score += 25;
  if (input.coverExpected ? input.coverEmbedded : true) score += 20;
  if (!input.comparison || input.comparison.score.clippingSafety >= 70) score += 10;
  if (!input.comparison || input.comparison.score.preservation >= 70) score += 10;
  if (lossyToLossyTranscode && input.transcodeReason !== "loudness normalization requires filtering" && !input.transcodeReason.includes("phone compatibility")) score -= 30;
  if (warnings.includes("cover-embed-unverified")) score -= 20;
  if (warnings.includes("audio-codec-missing")) score -= 40;
  if (input.comparison?.warnings.includes("duration-changed-too-much")) score -= 20;
  if (input.comparison?.warnings.includes("clipping-risk-detected")) score -= 15;
  if (codecCompatibility === "warning") score -= 10;

  let verdict: ProfileQualityVerdict = "unknown";
  if (warnings.includes("audio-codec-missing") || input.comparison?.verdict === "worse") verdict = "worse";
  else if (input.profile === "phone-aac-preserve" && input.audioStreamCopied && samsungMusicFriendly) verdict = "preserved-best";
  else if (input.profile === "phone-aac-preserve" && input.reencoded && input.transcodeReason.includes("phone compatibility")) verdict = "compatible-transcode";
  else if ((input.profile === "phone-aac-normalized" || input.profile === "mp3-normalized") && input.comparison?.verdict === "improved") verdict = "improved-volume-consistency";
  else if (input.audioStreamCopied || input.comparison?.verdict === "neutral") verdict = "neutral";

  let generationLossRisk: QualityPreservation["generationLossRisk"] = "none";
  if (lossyToLossyTranscode) generationLossRisk = input.transcodeReason.includes("loudness normalization") || input.transcodeReason.includes("phone compatibility") ? "medium" : "high";
  else if (input.reencoded) generationLossRisk = sourceCodec === "flac" || sourceCodec === "pcm" ? "low" : "medium";

  return {
    profile: input.profile,
    sourceCodec,
    sourceContainer,
    outputCodec,
    outputContainer,
    outputExtension: input.outputExtension,
    audioStreamCopied: input.audioStreamCopied,
    reencoded: input.reencoded,
    transcodeReason: input.transcodeReason,
    transcodeCount: input.reencoded ? 1 : 0,
    lossyToLossyTranscode,
    generationLossRisk,
    codecCompatibility,
    samsungMusicFriendly,
    bluetoothFriendly,
    phoneProfileScore: clampScore(score),
    verdict,
    warnings: Array.from(new Set(warnings)),
  };
}
