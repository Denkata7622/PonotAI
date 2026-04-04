export type OcrBlock = {
  text: string;
  confidence: number;
  bbox: { x: number; y: number; width: number; height: number };
};

export type InterpretedLine = {
  text: string;
  avgConfidence: number;
  bbox: { x: number; y: number; width: number; height: number };
  widthRatio: number;
  heightRatio: number;
  features: {
    length: number;
    letterRatio: number;
    digitRatio: number;
    wordCount: number;
    avgWordLength: number;
    capitalizationPattern: "lower" | "upper" | "title" | "mixed";
    heightPercentile: number;
    widthPercentile: number;
    verticalPositionPercentile: number;
    alignmentCluster: number;
  };
};

type ScreenType = "music" | "notes" | "general";

type InterpretedResult = {
  lines: InterpretedLine[];
  music?: {
    title: string | null;
    artist: string | null;
    confidenceScore: number;
  };
};

type RawLine = {
  text: string;
  avgConfidence: number;
  bbox: { x: number; y: number; width: number; height: number };
  widthRatio: number;
  heightRatio: number;
};

type FeatureLine = InterpretedLine;

type ScoredCandidate = {
  line: FeatureLine;
  visualProminence: number;
  textQuality: number;
  score: number;
};

const DEBUG_ENABLED = /^(1|true|yes)$/i.test(process.env.RECOGNITION_DEBUG ?? "");

const ZERO_WIDTH_REGEX = /[\u200B-\u200D\uFEFF]/g;
const DIGITS_OR_PUNCTUATION_ONLY = /^[\d\p{P}\p{S}\s]+$/u;
const TIME_ONLY_REGEX = /^\d{1,2}:\d{2}$/;
const DASH_SPLIT_REGEX = /\s[-–—]\s/;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalizeText(text: string): string {
  return text.replace(ZERO_WIDTH_REGEX, "").trim().replace(/\s{2,}/g, " ");
}

function percentileBy(values: number[], value: number): number {
  if (values.length === 0) {
    return 0;
  }

  let lowerOrEqual = 0;
  for (const current of values) {
    if (current <= value) {
      lowerOrEqual += 1;
    }
  }

  return lowerOrEqual / values.length;
}

function getImageBounds(blocks: OcrBlock[]): { width: number; height: number } {
  let maxX = 1;
  let maxY = 1;

  for (const block of blocks) {
    maxX = Math.max(maxX, block.bbox.x + block.bbox.width);
    maxY = Math.max(maxY, block.bbox.y + block.bbox.height);
  }

  return { width: maxX, height: maxY };
}

function normalizeBlocks(blocks: OcrBlock[]): OcrBlock[] {
  const normalized: OcrBlock[] = [];
  for (const block of blocks) {
    const text = normalizeText(block.text);
    if (!text) {
      continue;
    }

    normalized.push({
      ...block,
      text,
      confidence: Number.isFinite(block.confidence) ? block.confidence : 0,
    });
  }

  return normalized;
}

function reconstructLines(blocks: OcrBlock[]): RawLine[] {
  if (blocks.length === 0) {
    return [];
  }

  const sorted = [...blocks].sort((a, b) => {
    const ay = a.bbox.y + a.bbox.height / 2;
    const by = b.bbox.y + b.bbox.height / 2;
    if (Math.abs(ay - by) > 0.001) return ay - by;
    return a.bbox.x - b.bbox.x;
  });

  const image = getImageBounds(sorted);
  const averageHeight = sorted.reduce((sum, block) => sum + block.bbox.height, 0) / sorted.length;
  const yThreshold = Math.max(4, averageHeight * 0.6);

  const grouped: OcrBlock[][] = [];
  for (const block of sorted) {
    const centerY = block.bbox.y + block.bbox.height / 2;
    let attached = false;

    for (const group of grouped) {
      const representative = group[Math.floor(group.length / 2)];
      const repCenter = representative.bbox.y + representative.bbox.height / 2;
      if (Math.abs(centerY - repCenter) <= yThreshold) {
        group.push(block);
        attached = true;
        break;
      }
    }

    if (!attached) {
      grouped.push([block]);
    }
  }

  const lines: RawLine[] = [];
  for (const group of grouped) {
    const row = [...group].sort((a, b) => a.bbox.x - b.bbox.x);
    const merged: OcrBlock[] = [];

    for (const part of row) {
      const last = merged[merged.length - 1];
      if (!last) {
        merged.push({ ...part });
        continue;
      }

      const gap = part.bbox.x - (last.bbox.x + last.bbox.width);
      const overlap = gap <= 0;
      const close = gap <= Math.max(2, Math.min(last.bbox.height, part.bbox.height) * 0.4);

      if (overlap || close) {
        const newText = `${last.text} ${part.text}`.replace(/\s+/g, " ").trim();
        const left = Math.min(last.bbox.x, part.bbox.x);
        const top = Math.min(last.bbox.y, part.bbox.y);
        const right = Math.max(last.bbox.x + last.bbox.width, part.bbox.x + part.bbox.width);
        const bottom = Math.max(last.bbox.y + last.bbox.height, part.bbox.y + part.bbox.height);
        const weightedConfidence =
          (last.confidence * last.text.length + part.confidence * part.text.length) /
          Math.max(1, last.text.length + part.text.length);

        merged[merged.length - 1] = {
          text: newText,
          confidence: weightedConfidence,
          bbox: {
            x: left,
            y: top,
            width: right - left,
            height: bottom - top,
          },
        };
      } else {
        merged.push({ ...part });
      }
    }

    for (const line of merged) {
      lines.push({
        text: line.text,
        avgConfidence: line.confidence,
        bbox: line.bbox,
        widthRatio: line.bbox.width / image.width,
        heightRatio: line.bbox.height / image.height,
      });
    }
  }

  return lines.sort((a, b) => {
    if (Math.abs(a.bbox.y - b.bbox.y) > 0.001) return a.bbox.y - b.bbox.y;
    return a.bbox.x - b.bbox.x;
  });
}

function isNoise(line: RawLine): boolean {
  const trimmed = line.text.trim();
  if (!trimmed || trimmed.length < 2 || trimmed.length > 120) {
    return true;
  }

  if (line.avgConfidence < 40) {
    return true;
  }

  if (DIGITS_OR_PUNCTUATION_ONLY.test(trimmed)) {
    return true;
  }

  return TIME_ONLY_REGEX.test(trimmed);
}

function capitalizationPattern(text: string): "lower" | "upper" | "title" | "mixed" {
  const letters = text.replace(/[^\p{L}\s]/gu, "").trim();
  if (!letters) {
    return "mixed";
  }

  if (letters === letters.toLowerCase()) {
    return "lower";
  }

  if (letters === letters.toUpperCase()) {
    return "upper";
  }

  const words = letters.split(/\s+/).filter(Boolean);
  const isTitle = words.every((word) => {
    const [first = "", ...rest] = [...word];
    return first === first.toUpperCase() && rest.join("") === rest.join("").toLowerCase();
  });

  return isTitle ? "title" : "mixed";
}

function extractFeatures(lines: RawLine[]): FeatureLine[] {
  const heights = lines.map((line) => line.bbox.height);
  const widths = lines.map((line) => line.bbox.width);
  const ys = lines.map((line) => line.bbox.y);

  const clusterMap = new Map<number, number>();
  let clusterCounter = 0;

  return lines.map((line) => {
    const letters = (line.text.match(/\p{L}/gu) ?? []).length;
    const digits = (line.text.match(/\d/g) ?? []).length;
    const length = line.text.length;
    const words = line.text.split(/\s+/).filter(Boolean);
    const avgWordLength = words.length
      ? words.reduce((sum, word) => sum + word.length, 0) / words.length
      : 0;

    const alignedX = Math.round(line.bbox.x / 16);
    if (!clusterMap.has(alignedX)) {
      clusterMap.set(alignedX, clusterCounter);
      clusterCounter += 1;
    }

    return {
      ...line,
      features: {
        length,
        letterRatio: length > 0 ? letters / length : 0,
        digitRatio: length > 0 ? digits / length : 0,
        wordCount: words.length,
        avgWordLength,
        capitalizationPattern: capitalizationPattern(line.text),
        heightPercentile: percentileBy(heights, line.bbox.height),
        widthPercentile: percentileBy(widths, line.bbox.width),
        verticalPositionPercentile: percentileBy(ys, line.bbox.y),
        alignmentCluster: clusterMap.get(alignedX) ?? 0,
      },
    };
  });
}

function classifyContext(lines: FeatureLine[]): ScreenType {
  if (lines.length < 2) {
    return "general";
  }

  const sortedByHeight = [...lines].sort((a, b) => b.bbox.height - a.bbox.height);
  const first = sortedByHeight[0];
  const second = sortedByHeight[1];
  const similarlyTallLines = lines.filter((line) => line.bbox.height >= first.bbox.height * 0.85).length;
  const musicCandidate =
    first.features.heightPercentile >= 0.75 &&
    second.features.heightPercentile >= 0.5 &&
    first.features.letterRatio >= 0.6 &&
    second.features.letterRatio >= 0.6 &&
    Math.abs(first.bbox.x - second.bbox.x) <= Math.max(24, first.bbox.width * 0.2) &&
    second.bbox.y > first.bbox.y &&
    similarlyTallLines <= 3;

  if (musicCandidate) {
    return "music";
  }

  const avgHeight = lines.reduce((sum, line) => sum + line.bbox.height, 0) / lines.length;
  const sameHeightLines = lines.filter((line) => Math.abs(line.bbox.height - avgHeight) <= avgHeight * 0.25).length;
  const paragraphLike = lines.filter((line) => line.features.wordCount >= 5).length;

  if (lines.length >= 5 && sameHeightLines / lines.length >= 0.6 && paragraphLike >= 3) {
    return "notes";
  }

  return "general";
}

function scoreTitleCandidate(line: FeatureLine): ScoredCandidate {
  const visualProminence =
    line.features.heightPercentile * 0.55 +
    line.features.widthPercentile * 0.3 +
    clamp01(line.avgConfidence / 100) * 0.15;

  const capitalizationBonus = line.features.capitalizationPattern === "mixed" ? 0.1 : 0;
  const textQuality =
    line.features.letterRatio * 0.55 +
    (1 - line.features.digitRatio) * 0.25 +
    clamp01(1 - Math.abs(line.features.avgWordLength - 5) / 8) * 0.2 +
    capitalizationBonus;

  const score = clamp01(visualProminence * 0.4 + textQuality * 0.3);
  return { line, visualProminence, textQuality: clamp01(textQuality), score };
}

function scoreArtistCandidate(title: FeatureLine, line: FeatureLine): number {
  if (line.bbox.y <= title.bbox.y) {
    return 0;
  }

  const deltaY = line.bbox.y - (title.bbox.y + title.bbox.height);
  const expectedGap = Math.max(6, title.bbox.height * 0.35);
  const proximity = clamp01(1 - Math.abs(deltaY - expectedGap) / (expectedGap * 2));
  const xAlign = clamp01(1 - Math.abs(line.bbox.x - title.bbox.x) / Math.max(20, title.bbox.width * 0.35));
  const sizeRelation = clamp01(1 - Math.abs(line.bbox.height / Math.max(1, title.bbox.height) - 0.82));

  const visualProminence =
    line.features.heightPercentile * 0.45 + line.features.widthPercentile * 0.35 + clamp01(line.avgConfidence / 100) * 0.2;
  const textQuality =
    line.features.letterRatio * 0.6 +
    (1 - line.features.digitRatio) * 0.25 +
    (line.text.includes("&") || line.text.includes(",") ? 0.15 : 0);
  const spatialRelationship = proximity * 0.5 + xAlign * 0.35 + sizeRelation * 0.15;

  return clamp01(visualProminence * 0.4 + clamp01(textQuality) * 0.3 + spatialRelationship * 0.3);
}

function splitCombinedTitleArtist(line: FeatureLine): { title: string; artist: string } | null {
  if (!DASH_SPLIT_REGEX.test(line.text)) {
    return null;
  }

  const [leftRaw, rightRaw] = line.text.split(DASH_SPLIT_REGEX, 2);
  const left = leftRaw?.trim() ?? "";
  const right = rightRaw?.trim() ?? "";

  if (!left || !right) {
    return null;
  }

  const leftLetters = (left.match(/\p{L}/gu) ?? []).length;
  const rightLetters = (right.match(/\p{L}/gu) ?? []).length;
  if (leftLetters === 0 || rightLetters === 0) {
    return null;
  }

  return {
    title: left,
    artist: right,
  };
}

function extractMusic(lines: FeatureLine[], context: ScreenType): InterpretedResult["music"] | undefined {
  const titleCandidates = lines
    .filter((line) => line.features.length >= 3 && line.features.length <= 60 && line.features.digitRatio <= 0.35)
    .map(scoreTitleCandidate)
    .sort((a, b) => b.score - a.score);

  const debugTop = titleCandidates.slice(0, 5).map((candidate) => ({
    text: candidate.line.text,
    score: Number(candidate.score.toFixed(3)),
    visualProminence: Number(candidate.visualProminence.toFixed(3)),
    textQuality: Number(candidate.textQuality.toFixed(3)),
  }));

  if (titleCandidates.length === 0) {
    if (DEBUG_ENABLED) {
      console.log("[ocrInterpreter] classification=", context);
      console.log("[ocrInterpreter] top5=", debugTop);
      console.log("[ocrInterpreter] extracted=", { title: null, artist: null, confidenceScore: 0 });
    }
    return undefined;
  }

  const titleCandidate = titleCandidates[0].line;
  const split = splitCombinedTitleArtist(titleCandidate);
  if (split) {
    const confidenceScore = clamp01(titleCandidates[0].score * 0.9 + (context === "music" ? 0.2 : 0.12));
    if (DEBUG_ENABLED) {
      console.log("[ocrInterpreter] classification=", context);
      console.log("[ocrInterpreter] top5=", debugTop);
      console.log("[ocrInterpreter] extracted=", {
        title: split.title,
        artist: split.artist,
        confidenceScore,
      });
    }

    if (confidenceScore < 0.6) {
      return undefined;
    }

    return {
      title: split.title,
      artist: split.artist,
      confidenceScore,
    };
  }

  const artistOptions = lines
    .filter((line) => line !== titleCandidate && line.features.letterRatio >= 0.5)
    .map((line) => ({ line, score: scoreArtistCandidate(titleCandidate, line) }))
    .sort((a, b) => {
      if (Math.abs(b.score - a.score) > 0.001) {
        return b.score - a.score;
      }
      return a.line.bbox.y - b.line.bbox.y;
    });

  const artist = artistOptions[0]?.line.text ?? null;
  const artistScore = artistOptions[0]?.score ?? 0;
  const contextBoost = context === "music" ? 0.12 : context === "general" ? -0.18 : -0.24;
  const confidenceScore = clamp01(titleCandidates[0].score * 0.65 + artistScore * 0.35 + contextBoost);

  if (DEBUG_ENABLED) {
    console.log("[ocrInterpreter] classification=", context);
    console.log("[ocrInterpreter] top5=", debugTop);
    console.log("[ocrInterpreter] extracted=", {
      title: titleCandidate.text,
      artist,
      confidenceScore,
    });
  }

  if (confidenceScore < 0.6) {
    return undefined;
  }

  return {
    title: titleCandidate.text,
    artist,
    confidenceScore,
  };
}

/**
 * Interprets OCR word blocks into scored lines and optional music metadata extraction.
 * @param blocks OCR word blocks.
 * @returns Structured OCR interpretation output.
 * @throws Does not throw intentionally; returns conservative output when extraction confidence is low.
 */
export function interpretOcr(blocks: OcrBlock[]): InterpretedResult {
  const normalized = normalizeBlocks(blocks);
  const reconstructed = reconstructLines(normalized);
  const denoised = reconstructed.filter((line) => !isNoise(line));
  const lines = extractFeatures(denoised);
  const classification = classifyContext(lines);
  const music = extractMusic(lines, classification);

  return music ? { lines, music } : { lines };
}
