export type AudioPolishMode =
  | "metadata-only"
  | "normalize-loudness"
  | "normalize-loudness-safe"
  | "analyze-only";

export type ExportAudioProfile =
  | "compatibility-mp3"
  | "phone-aac-preserve"
  | "phone-aac-normalized"
  | "mp3-normalized"
  | "analysis-only";

export type AudioPolishTarget = {
  integratedLufs: number;
  truePeakDb: number;
  loudnessRangeLra: number;
};

export type LegacyLoudnessTarget = {
  integrated: number;
  truePeak: number;
  lra: number;
};

export type AudioPolishOptions = {
  profile: ExportAudioProfile;
  mode: AudioPolishMode;
  normalizeLoudness: boolean;
  truePeakLimit: boolean;
  trimSilence: boolean;
  analyzeBeforeAfter: boolean;
  exportComparisonReport: boolean;
  loudnessTarget: AudioPolishTarget;
};

export type DownloadPostProcessingOptions = {
  cleanMetadata: boolean;
  embedCover: boolean;
  normalizeLoudness: boolean;
  loudnessTarget: LegacyLoudnessTarget;
  audioPolish: AudioPolishOptions;
};

export type AudioPolishValidationResult =
  | { ok: true; options: DownloadPostProcessingOptions }
  | { ok: false; code: "invalid-audio-polish-options"; message: string; fix: string };

export const AUDIO_POLISH_MODES: AudioPolishMode[] = [
  "metadata-only",
  "normalize-loudness",
  "normalize-loudness-safe",
  "analyze-only",
];

export const EXPORT_AUDIO_PROFILES: ExportAudioProfile[] = [
  "compatibility-mp3",
  "phone-aac-preserve",
  "phone-aac-normalized",
  "mp3-normalized",
  "analysis-only",
];

export const DEFAULT_AUDIO_POLISH_TARGET: AudioPolishTarget = {
  integratedLufs: -14,
  truePeakDb: -1.5,
  loudnessRangeLra: 11,
};

export const DEFAULT_LEGACY_LOUDNESS_TARGET: LegacyLoudnessTarget = {
  integrated: DEFAULT_AUDIO_POLISH_TARGET.integratedLufs,
  truePeak: DEFAULT_AUDIO_POLISH_TARGET.truePeakDb,
  lra: DEFAULT_AUDIO_POLISH_TARGET.loudnessRangeLra,
};

export const DEFAULT_AUDIO_POLISH_OPTIONS: AudioPolishOptions = {
  profile: "compatibility-mp3",
  mode: "metadata-only",
  normalizeLoudness: false,
  truePeakLimit: false,
  trimSilence: false,
  analyzeBeforeAfter: true,
  exportComparisonReport: true,
  loudnessTarget: DEFAULT_AUDIO_POLISH_TARGET,
};

const FORBIDDEN_OPTION_KEYS = /^(?:filter|filters|af|ffmpegArgs|ffmpegArgv|args|argv|command|shell|codec|container|outputPath|inputPath)$/i;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numberFrom(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = numberFrom(value);
  return Math.min(max, Math.max(min, parsed ?? fallback));
}

function booleanDefault(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  return fallback;
}

function hasForbiddenOptionKey(value: unknown, depth = 0): string | undefined {
  if (!value || typeof value !== "object" || depth > 4) return undefined;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const nested = hasForbiddenOptionKey(entry, depth + 1);
      if (nested) return nested;
    }
    return undefined;
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_OPTION_KEYS.test(key)) return key;
    const nestedKey = hasForbiddenOptionKey(nested, depth + 1);
    if (nestedKey) return nestedKey;
  }
  return undefined;
}

function modeFrom(value: unknown): AudioPolishMode | undefined {
  return typeof value === "string" && (AUDIO_POLISH_MODES as string[]).includes(value)
    ? value as AudioPolishMode
    : undefined;
}

function profileFrom(value: unknown): ExportAudioProfile | undefined {
  return typeof value === "string" && (EXPORT_AUDIO_PROFILES as string[]).includes(value)
    ? value as ExportAudioProfile
    : undefined;
}

function modeForProfile(profile: ExportAudioProfile, fallbackMode?: AudioPolishMode): AudioPolishMode {
  if (profile === "phone-aac-normalized" || profile === "mp3-normalized") return fallbackMode === "normalize-loudness-safe" ? "normalize-loudness-safe" : "normalize-loudness";
  if (profile === "analysis-only") return "analyze-only";
  return fallbackMode ?? "metadata-only";
}

function profileForLegacyMode(mode: AudioPolishMode, legacyNormalize: boolean): ExportAudioProfile {
  if (mode === "analyze-only") return "analysis-only";
  if (mode === "normalize-loudness" || mode === "normalize-loudness-safe" || legacyNormalize) return "mp3-normalized";
  return DEFAULT_AUDIO_POLISH_OPTIONS.profile;
}

function legacyTargetFromPolish(target: AudioPolishTarget): LegacyLoudnessTarget {
  return {
    integrated: target.integratedLufs,
    truePeak: target.truePeakDb,
    lra: target.loudnessRangeLra,
  };
}

function normalizeTarget(record: Record<string, unknown>, legacyRecord: Record<string, unknown>): AudioPolishTarget {
  return {
    integratedLufs: clamp(
      record.integratedLufs ?? record.integrated ?? legacyRecord.integrated,
      -23,
      -8,
      DEFAULT_AUDIO_POLISH_TARGET.integratedLufs,
    ),
    truePeakDb: clamp(
      record.truePeakDb ?? record.truePeak ?? legacyRecord.truePeak,
      -3,
      -0.1,
      DEFAULT_AUDIO_POLISH_TARGET.truePeakDb,
    ),
    loudnessRangeLra: clamp(
      record.loudnessRangeLra ?? record.lra ?? legacyRecord.lra,
      5,
      20,
      DEFAULT_AUDIO_POLISH_TARGET.loudnessRangeLra,
    ),
  };
}

export function normalizeAudioPolishOptions(value: unknown): DownloadPostProcessingOptions {
  const record = asRecord(value);
  const audioPolishRecord = asRecord(record.audioPolish);
  const legacyTargetRecord = asRecord(record.loudnessTarget);
  const polishTargetRecord = asRecord(audioPolishRecord.loudnessTarget);
  const explicitMode = modeFrom(audioPolishRecord.mode);
  const explicitProfile = profileFrom(audioPolishRecord.profile ?? record.profile);
  const legacyNormalize = record.normalizeLoudness === true;
  const profile = explicitProfile ?? profileForLegacyMode(explicitMode ?? DEFAULT_AUDIO_POLISH_OPTIONS.mode, legacyNormalize);
  const mode = modeForProfile(profile, explicitMode ?? (legacyNormalize ? "normalize-loudness" : undefined));
  const normalizeLoudness = profile === "phone-aac-normalized"
    || profile === "mp3-normalized"
    || mode === "normalize-loudness"
    || mode === "normalize-loudness-safe";
  const target = normalizeTarget(polishTargetRecord, legacyTargetRecord);
  const truePeakLimit = mode === "normalize-loudness-safe" || booleanDefault(audioPolishRecord.truePeakLimit ?? record.truePeakLimit, false);
  const resolvedMode: AudioPolishMode = truePeakLimit && normalizeLoudness ? "normalize-loudness-safe" : mode;

  return {
    cleanMetadata: record.cleanMetadata !== false,
    embedCover: record.embedCover !== false,
    normalizeLoudness,
    loudnessTarget: legacyTargetFromPolish(target),
    audioPolish: {
      profile,
      mode: resolvedMode,
      normalizeLoudness,
      truePeakLimit: resolvedMode === "normalize-loudness-safe" || truePeakLimit,
      trimSilence: booleanDefault(audioPolishRecord.trimSilence ?? record.trimSilence, DEFAULT_AUDIO_POLISH_OPTIONS.trimSilence),
      analyzeBeforeAfter: booleanDefault(audioPolishRecord.analyzeBeforeAfter ?? record.analyzeBeforeAfter, DEFAULT_AUDIO_POLISH_OPTIONS.analyzeBeforeAfter),
      exportComparisonReport: booleanDefault(audioPolishRecord.exportComparisonReport ?? record.exportComparisonReport, DEFAULT_AUDIO_POLISH_OPTIONS.exportComparisonReport),
      loudnessTarget: target,
    },
  };
}

export function validatePostProcessingOptions(value: unknown): AudioPolishValidationResult {
  const forbiddenKey = hasForbiddenOptionKey(value);
  if (forbiddenKey) {
    return {
      ok: false,
      code: "invalid-audio-polish-options",
      message: "Audio polish options cannot include custom ffmpeg arguments or filters.",
      fix: `Remove the "${forbiddenKey}" option. Choose one of the supported audio polish modes instead.`,
    };
  }

  const record = asRecord(value);
  const audioPolishRecord = asRecord(record.audioPolish);
  if (audioPolishRecord.mode !== undefined && !modeFrom(audioPolishRecord.mode)) {
    return {
      ok: false,
      code: "invalid-audio-polish-options",
      message: "Unsupported audio polish mode.",
      fix: `Use one of: ${AUDIO_POLISH_MODES.join(", ")}.`,
    };
  }
  if ((audioPolishRecord.profile !== undefined || record.profile !== undefined) && !profileFrom(audioPolishRecord.profile ?? record.profile)) {
    return {
      ok: false,
      code: "invalid-audio-polish-options",
      message: "Unsupported export audio profile.",
      fix: `Use one of: ${EXPORT_AUDIO_PROFILES.join(", ")}.`,
    };
  }

  return { ok: true, options: normalizeAudioPolishOptions(value) };
}

export function usesAudioReencoding(options: Pick<DownloadPostProcessingOptions, "audioPolish">): boolean {
  return options.audioPolish.profile === "phone-aac-normalized"
    || options.audioPolish.profile === "mp3-normalized"
    || options.audioPolish.mode === "normalize-loudness"
    || options.audioPolish.mode === "normalize-loudness-safe"
    || options.audioPolish.trimSilence;
}
