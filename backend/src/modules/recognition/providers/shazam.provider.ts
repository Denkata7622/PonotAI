import fs from "fs/promises";
import os from "os";
import path from "path";
import { type ProviderSongMetadata } from "./audd.provider";

export class MissingShazamClientError extends Error {
  constructor(message = "Shazam provider unavailable. Install shazam-api package to enable fallback.") {
    super(message);
    this.name = "MissingShazamClientError";
  }
}

type ShazamRecognition = {
  track?: {
    title?: string;
    subtitle?: string;
    genres?: { primary?: string };
    sections?: Array<{ metadata?: Array<{ title?: string; text?: string }> }>;
    hub?: {
      actions?: Array<{ type?: string; uri?: string }>;
    };
  };
};

function getReleaseYear(payload: ShazamRecognition): number | null {
  const yearText = payload.track?.sections?.flatMap((section) => section.metadata || [])
    .find((item) => item.title?.toLowerCase() === "released")?.text;
  if (!yearText) return null;
  const firstYear = Number(yearText.match(/\b(19|20)\d{2}\b/)?.[0]);
  return Number.isFinite(firstYear) ? firstYear : null;
}

async function recognizeWithCommunityClient(filePath: string): Promise<ShazamRecognition | null> {
  let mod: unknown;
  try {
    const dynamicImport = new Function("m", "return import(m)") as (specifier: string) => Promise<unknown>;
    mod = await dynamicImport("shazam-api");
  } catch {
    throw new MissingShazamClientError();
  }

  const candidate = mod as {
    default?: unknown;
    Shazam?: unknown;
    recognizeSong?: (input: string) => Promise<ShazamRecognition | null>;
  };

  if (typeof candidate.recognizeSong === "function") {
    return candidate.recognizeSong(filePath);
  }

  const ctor = (candidate.default ?? candidate.Shazam) as (new (...args: unknown[]) => { recognizeSong?: (input: string) => Promise<ShazamRecognition | null>; recognise?: (input: string) => Promise<ShazamRecognition | null> }) | undefined;
  if (!ctor) {
    throw new MissingShazamClientError("shazam-api package is installed but has unsupported exports.");
  }

  const client = new ctor();
  if (typeof client.recognizeSong === "function") {
    return client.recognizeSong(filePath);
  }
  if (typeof client.recognise === "function") {
    return client.recognise(filePath);
  }

  throw new MissingShazamClientError("shazam-api client does not expose recognize methods.");
}

/**
 * Recognizes an audio clip using Shazam mock data or community client fallback.
 * @param buffer Audio file buffer.
 * @param filename Original upload filename.
 * @returns Promise resolving to normalized provider metadata, or `null` when no match is found.
 * @throws MissingShazamClientError when live fallback is attempted without compatible shazam client package.
 */
export async function recognizeWithShazam(buffer: Buffer, filename: string): Promise<ProviderSongMetadata | null> {
  const mocked = process.env.SHAZAM_MOCK_RESPONSE;
  if (mocked) {
    try {
      const payload = JSON.parse(mocked) as ShazamRecognition;
      const title = payload?.track?.title?.trim();
      const artist = payload?.track?.subtitle?.trim();

      if (!title || !artist) {
        return null;
      }

      return {
        songName: title,
        artist,
        album: "Unknown Album",
        genre: payload?.track?.genres?.primary || "Unknown Genre",
        releaseYear: getReleaseYear(payload || {}),
        confidenceScore: 0.8,
        platformLinks: {},
        youtubeVideoId: undefined,
      };
    } catch {
      // ignore invalid mock and continue
    }
  }

  const tempPath = path.join(os.tmpdir(), `ponotai-shazam-${Date.now()}-${filename || "recording"}.webm`);

  await fs.writeFile(tempPath, buffer);

  try {
    const payload = await recognizeWithCommunityClient(tempPath);
    const title = payload?.track?.title?.trim();
    const artist = payload?.track?.subtitle?.trim();

    if (!title || !artist) {
      return null;
    }

    const appleMusicUri = payload?.track?.hub?.actions?.find((action) => action.type === "applemusicplay")?.uri;


    return {
      songName: title,
      artist,
      album: "Unknown Album",
      genre: payload?.track?.genres?.primary || "Unknown Genre",
      releaseYear: getReleaseYear(payload || {}),
      confidenceScore: 0.75,
      platformLinks: {
        appleMusic: appleMusicUri,
      },
      youtubeVideoId: undefined,
    };
  } finally {
    await fs.unlink(tempPath).catch(() => undefined);
  }
}
