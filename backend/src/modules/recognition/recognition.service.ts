import Tesseract from "tesseract.js";
import { parseBuffer } from "music-metadata";
import { interpretOcr, type InterpretedLine, type OcrBlock } from "./ocrInterpreter";
import {
  lookupSongByTitleAndArtist,
  NoVerifiedResultError,
  recognizeAudioWithAudd,
  type ProviderSongMetadata,
} from "./providers/audd.provider";
import { recognizeWithAcrCloud } from "./providers/acrcloud.provider";
import { recognizeWithShazam } from "./providers/shazam.provider";
import { matchBulgarianSong } from "./providers/bulgarian.provider";

export type SongMetadata = ProviderSongMetadata & {
  source: "provider" | "ocr_fallback";
  verificationStatus: "verified" | "not_found";
};

type OcrCandidateMetadata = {
  songName: string;
  artist: string;
  album: string;
  confidenceScore: number;
};

type TesseractWord = {
  text?: string;
  confidence?: number;
  bbox?: {
    x0?: number;
    y0?: number;
    x1?: number;
    y1?: number;
  };
};

const UNKNOWN_METADATA: OcrCandidateMetadata = {
  songName: "Unknown Song",
  artist: "Unknown Artist",
  album: "Unknown Album",
  confidenceScore: 0,
};

const OCR_CHAR_WHITELIST =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 &-_'\"():,./+!?[]";


const MIN_PROVIDER_CONFIDENCE = 0.7;

function hasConfiguredAudioProvider(): boolean {
  const hasAudd = Boolean(process.env.AUDD_API_TOKEN || process.env.AUDD_API_KEY);
  const hasAcr = Boolean(process.env.ACRCLOUD_ACCESS_KEY && process.env.ACRCLOUD_ACCESS_SECRET && process.env.ACRCLOUD_HOST) || Boolean(process.env.ACRCLOUD_API_KEY);
  const hasShazam = Boolean(process.env.SHAZAM_MOCK_RESPONSE);
  return hasAudd || hasAcr || hasShazam;
}

function buildMockAudioRecognition(): SongMetadata {
  return {
    songName: "Demo Recognition",
    artist: "PonotAI Sample",
    album: "Competition Demo",
    genre: "Unknown Genre",
    releaseYear: null,
    confidenceScore: 0.51,
    youtubeVideoId: undefined,
    platformLinks: {},
    source: "ocr_fallback",
    verificationStatus: "not_found",
  };
}

async function ensureYoutubeLink(metadata: ProviderSongMetadata): Promise<ProviderSongMetadata> {
  if (metadata.youtubeVideoId) {
    return metadata;
  }

  const lookedUp = await lookupSongByTitleAndArtist(metadata.songName, metadata.artist);
  if (!lookedUp?.youtubeVideoId) {
    return metadata;
  }

  return {
    ...metadata,
    youtubeVideoId: lookedUp.youtubeVideoId,
    platformLinks: {
      ...metadata.platformLinks,
      youtube: lookedUp.platformLinks.youtube,
    },
  };
}

async function extractMetadataFromLocalTags(buffer: Buffer): Promise<ProviderSongMetadata | null> {
  try {
    const parsed = await parseBuffer(buffer, { mimeType: "audio/webm" }, { duration: false });
    const title = parsed.common.title?.trim();
    const artist = parsed.common.artist?.trim();

    if (!title || !artist) {
      return null;
    }

    return {
      songName: title,
      artist,
      album: parsed.common.album?.trim() || "Unknown Album",
      genre: parsed.common.genre?.[0] || "Unknown Genre",
      releaseYear: typeof parsed.common.year === "number" ? parsed.common.year : null,
      confidenceScore: 0.55,
      youtubeVideoId: undefined,
      platformLinks: {},
    };
  } catch {
    return null;
  }
}

const VISION_SYSTEM_PROMPT = `You are analyzing a music screenshot (Spotify playlist, Apple Music library, YouTube Music queue, now playing screen, etc.).

Extract ALL songs visible in the image. This could be:
- A single now-playing song
- A playlist with multiple songs
- A queue or album tracklist
- Search results

For EACH song you see, extract the complete song title and complete artist name.

CRITICAL RULES:
1. Capture ENTIRE multi-word names (e.g., "Mason Jar Moonshine", not "Jar")
2. Extract every song visible, not just the first one
3. DO NOT extract UI elements (Play, Pause, timestamps, durations, track numbers)
4. DO NOT extract playlist names or album titles as songs

Respond with ONLY a JSON array, no other text:
[
  {"songName":"complete title","artist":"complete artist","album":""},
  {"songName":"complete title","artist":"complete artist","album":""},
  ...
]

If no songs are visible, respond with an empty array: []`;

function scoreLineForTitle(line: InterpretedLine): number {
  return (
    line.features.heightPercentile * 0.45 +
    line.features.widthPercentile * 0.2 +
    line.features.letterRatio * 0.2 +
    (line.avgConfidence / 100) * 0.15
  );
}

/**
 * Heuristically derives fallback song metadata from interpreted OCR lines.
 * @param lines Interpreted OCR lines with extracted geometric/text features.
 * @returns Best-effort metadata when a plausible title is found, otherwise `null`.
 * @throws Does not throw intentionally; parsing guards return `null` on low confidence.
 */
export function deriveBestEffortMetadata(lines: InterpretedLine[]): OcrCandidateMetadata | null {
  if (lines.length === 0) {
    return null;
  }

  const eligible = lines.filter((line) => line.features.letterRatio >= 0.45 && line.features.length >= 2 && line.features.length <= 80);
  if (eligible.length === 0) {
    return null;
  }

  const titleLine = [...eligible].sort((a, b) => scoreLineForTitle(b) - scoreLineForTitle(a))[0];
  const artistLine = [...eligible]
    .filter((line) => line !== titleLine && line.bbox.y >= titleLine.bbox.y)
    .sort((a, b) => {
      const aDistance = Math.abs(a.bbox.y - (titleLine.bbox.y + titleLine.bbox.height));
      const bDistance = Math.abs(b.bbox.y - (titleLine.bbox.y + titleLine.bbox.height));
      if (Math.abs(aDistance - bDistance) > 0.001) {
        return aDistance - bDistance;
      }
      return Math.abs(a.bbox.x - titleLine.bbox.x) - Math.abs(b.bbox.x - titleLine.bbox.x);
    })[0];

  return {
    songName: titleLine.text,
    artist: artistLine?.text ?? UNKNOWN_METADATA.artist,
    album: UNKNOWN_METADATA.album,
    confidenceScore: Math.max(0.25, Math.min(0.59, titleLine.avgConfidence / 100)),
  };
}

function toProviderResponse(metadata: ProviderSongMetadata): SongMetadata {
  return {
    ...metadata,
    source: "provider",
    verificationStatus: metadata.youtubeVideoId ? "verified" : "not_found",
  };
}

function toFallbackResponse(metadata: OcrCandidateMetadata): SongMetadata {
  return {
    songName: metadata.songName,
    artist: metadata.artist,
    album: metadata.album,
    genre: "Unknown Genre",
    platformLinks: {},
    youtubeVideoId: undefined,
    releaseYear: null,
    confidenceScore: metadata.confidenceScore,
    source: "ocr_fallback",
    verificationStatus: "not_found",
  };
}

function toOcrBlocks(words: TesseractWord[]): OcrBlock[] {
  const blocks: OcrBlock[] = [];

  for (const word of words) {
    const text = typeof word.text === "string" ? word.text : "";
    const bbox = word.bbox;
    if (!bbox) {
      continue;
    }

    const x0 = bbox.x0 ?? 0;
    const y0 = bbox.y0 ?? 0;
    const x1 = bbox.x1 ?? x0;
    const y1 = bbox.y1 ?? y0;

    blocks.push({
      text,
      confidence: typeof word.confidence === "number" ? word.confidence : 0,
      bbox: {
        x: x0,
        y: y0,
        width: Math.max(1, x1 - x0),
        height: Math.max(1, y1 - y0),
      },
    });
  }

  return blocks;
}

function parseVisionArrayResponse(text: string): OcrCandidateMetadata[] {
  const cleaned = text.trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new NoVerifiedResultError("Could not parse vision response.");
  }

  if (!Array.isArray(parsed)) {
    throw new NoVerifiedResultError("Vision did not return an array of songs.");
  }

  return parsed
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .filter((item) => typeof item["songName"] === "string" && typeof item["artist"] === "string")
    .map((item) => {
      const songName = (item["songName"] as string).trim();
      const artist = (item["artist"] as string).trim();
      const album = typeof item["album"] === "string"
        ? (item["album"] as string).trim() || UNKNOWN_METADATA.album
        : UNKNOWN_METADATA.album;

      return {
        songName,
        artist,
        album,
        confidenceScore: 0.75,
      };
    })
    .filter((item) => item.songName.length > 0 && item.artist.length > 0);
}

async function extractMetadataWithHuggingFaceVision(buffer: Buffer): Promise<OcrCandidateMetadata[]> {
  const apiKey = process.env.HUGGINGFACE_API_KEY;
  if (!apiKey) {
    throw new NoVerifiedResultError("Hugging Face vision is not configured.");
  }

  const modelUrl = process.env.HUGGINGFACE_VISION_URL ?? "https://router.huggingface.co/v1/chat/completions";
  const response = await fetch(modelUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.HUGGINGFACE_VISION_MODEL ?? "Qwen/Qwen2.5-VL-7B-Instruct",
      messages: [
        { role: "system", content: VISION_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract all visible songs from this screenshot.",
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/png;base64,${buffer.toString("base64")}`,
              },
            },
          ],
        },
      ],
      temperature: 0,
      max_tokens: 700,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    console.error("[vision] API error body:", errorBody);
    throw new NoVerifiedResultError(`Vision extraction failed with status ${response.status}.`);
  }
  
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new NoVerifiedResultError("Vision extraction returned an empty response.");
  }

  const extracted = parseVisionArrayResponse(content);
  console.log("[recognition] Vision extracted JSON array:", extracted);

  return extracted;
}

async function extractMetadataWithOcr(buffer: Buffer, language = "eng"): Promise<OcrCandidateMetadata> {
  const worker = await Tesseract.createWorker(language);

  await worker.setParameters({
    tessedit_char_whitelist: OCR_CHAR_WHITELIST,
    preserve_interword_spaces: "1",
  });

  try {
    const ocrResult = await worker.recognize(buffer);
    const words = ((ocrResult.data as { words?: TesseractWord[] }).words ?? []) as TesseractWord[];
    const interpreted = interpretOcr(toOcrBlocks(words));

    if (interpreted.music?.title) {
      return {
        songName: interpreted.music.title,
        artist: interpreted.music.artist ?? UNKNOWN_METADATA.artist,
        album: UNKNOWN_METADATA.album,
        confidenceScore: interpreted.music.confidenceScore,
      };
    }

    const fallback = deriveBestEffortMetadata(interpreted.lines);
    if (!fallback) {
      throw new NoVerifiedResultError("Could not extract readable song text from the uploaded image.");
    }

    return fallback;
  } finally {
    await worker.terminate();
  }
}

/**
 * Runs provider chain + tag fallback to resolve audio files into normalized song metadata.
 * @param buffer Uploaded audio file buffer.
 * @param originalName Original uploaded filename.
 * @returns Promise resolving to normalized song metadata.
 * @throws NoVerifiedResultError when providers and metadata tag fallback cannot verify a song.
 */
export async function recognizeSongFromAudio(buffer: Buffer, originalName: string): Promise<SongMetadata> {
  if (!hasConfiguredAudioProvider()) {
    return buildMockAudioRecognition();
  }
  const providers: Array<{
    name: string;
    run: () => Promise<ProviderSongMetadata | null>;
  }> = [
    {
      name: "AuDD",
      run: () => recognizeAudioWithAudd(buffer, originalName),
    },
    {
      name: "ACRCloud",
      run: () => recognizeWithAcrCloud(buffer, originalName),
    },
    {
      name: "Shazam",
      run: () => recognizeWithShazam(buffer, originalName),
    },
  ];

  for (const provider of providers) {
    console.log(`[recognition] Trying ${provider.name}...`);

    try {
      const candidate = await provider.run();
      if (!candidate) {
        console.log(`[recognition] ${provider.name} failed: no match`);
        continue;
      }

      const confidence = candidate.confidenceScore ?? 0;
      if (confidence < MIN_PROVIDER_CONFIDENCE) {
        console.log(`[recognition] ${provider.name} failed: low confidence (${confidence.toFixed(2)})`);
        continue;
      }

      const enriched = await ensureYoutubeLink(candidate);
      console.log(`[recognition] ✓ ${provider.name} found: "${enriched.songName}" by "${enriched.artist}" (confidence: ${confidence.toFixed(2)})`);
      return toProviderResponse(enriched);
    } catch (error) {
      console.warn(`[recognition] ${provider.name} error:`, (error as Error).message);
    }
  }

  console.log("[recognition] Provider chain exhausted, trying local metadata tags...");
  const localTagResult = await extractMetadataFromLocalTags(buffer);

  if (localTagResult) {
    const enrichedTags = await ensureYoutubeLink(localTagResult);
    console.log(`[recognition] ✓ Local tags found: "${enrichedTags.songName}" by "${enrichedTags.artist}"`);
    return toProviderResponse(enrichedTags);
  }

  throw new NoVerifiedResultError("Recognition failed across all providers and local metadata tags.");
}

/**
 * Extracts song candidates from image content and verifies each via lookup providers when possible.
 * @param buffer Uploaded image buffer.
 * @param language OCR language code (defaults to `eng`).
 * @returns Promise resolving to one or more normalized song metadata entries.
 * @throws NoVerifiedResultError when no song candidates can be extracted.
 */
export async function recognizeSongFromImage(buffer: Buffer, language = "eng"): Promise<SongMetadata[]> {
  let visionResults: OcrCandidateMetadata[];

  try {
    visionResults = await extractMetadataWithHuggingFaceVision(buffer);
  } catch (error) {
    console.warn("[recognition] Vision extraction unavailable or rejected, falling back to OCR.", error);
    const fallback = await extractMetadataWithOcr(buffer, language);
    visionResults = [fallback];
  }

  if (visionResults.length === 0) {
    throw new NoVerifiedResultError("No songs detected in image.");
  }

  const songMetadataResults: SongMetadata[] = [];

  for (const candidate of visionResults) {
    try {
      const providerResult = await lookupSongByTitleAndArtist(candidate.songName, candidate.artist);
      if (providerResult) {
        songMetadataResults.push(toProviderResponse(providerResult));
      } else {
        const bulgarianFallback = matchBulgarianSong(`${candidate.songName} ${candidate.artist}`);
        if (bulgarianFallback) {
          songMetadataResults.push(toProviderResponse(bulgarianFallback));
        } else {
          songMetadataResults.push(toFallbackResponse(candidate));
        }
      }
    } catch {
      console.warn(`[recognition] Lookup failed for "${candidate.songName}" by "${candidate.artist}"`);
    }
  }

  if (songMetadataResults.length === 0) {
    throw new NoVerifiedResultError("No songs detected in image.");
  }

  return songMetadataResults;
}
