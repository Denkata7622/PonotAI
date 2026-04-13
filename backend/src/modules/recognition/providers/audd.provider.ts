export type ProviderSongMetadata = {
  songName: string;
  artist: string;
  album: string;
  genre: string;
  confidenceScore: number;
  platformLinks: {
    youtube?: string;
    appleMusic?: string;
    spotify?: string;
    preview?: string;
  };
  youtubeVideoId?: string;
  releaseYear: number | null;
};

export class NoVerifiedResultError extends Error {
  constructor(message = "No verified YouTube result found for recognized song.") {
    super(message);
    this.name = "NoVerifiedResultError";
  }
}

export class MissingProviderConfigError extends Error {
  constructor(message = "Missing AuDD API key. Set AUDD_API_TOKEN or AUDD_API_KEY.") {
    super(message);
    this.name = "MissingProviderConfigError";
  }
}

type AuddResponse = {
  status: "success" | "error";
  result: null | {
    title?: string;
    artist?: string | { name?: string };
    album?: string | { title?: string };
    release_date?: string;
    song_link?: string;
    apple_music?: { url?: string };
    spotify?: { external_urls?: { spotify?: string } };
  };
};

type YouTubeSearchResponse = { error?: { errors?: Array<{ reason?: string }> }; items?: Array<{ id?: { videoId?: string } }> };
type FetchWithRetryOptions = { attempts: number; baseDelayMs: number };

let youtubeRateLimitedUntil = 0;

export function shouldRetryStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithRetry(input: URL | string, init: RequestInit, options: FetchWithRetryOptions): Promise<Response | null> {
  let attempt = 0;
  while (attempt < options.attempts) {
    attempt += 1;
    try {
      const response = await fetch(input, init);
      if (!shouldRetryStatus(response.status)) return response;
    } catch {
      // retry
    }
    if (attempt < options.attempts) await delay(options.baseDelayMs * 2 ** (attempt - 1));
  }
  return null;
}

function readArtist(value: string | { name?: string } | undefined): string | null {
  if (!value) return null;
  if (typeof value === "string") return normalizeVisibleText(value) || null;
  return typeof value.name === "string" ? normalizeVisibleText(value.name) || null : null;
}

function readAlbum(value: string | { title?: string } | undefined): string | null {
  if (!value) return null;
  if (typeof value === "string") return normalizeVisibleText(value) || null;
  return typeof value.title === "string" ? normalizeVisibleText(value.title) || null : null;
}

function getReleaseYear(releaseDate?: string): number | null {
  if (!releaseDate) return null;
  const parsed = new Date(releaseDate);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getUTCFullYear();
}

async function findYouTubeVideoId(query: string): Promise<string | null> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key || !query.trim()) return null;
  if (Date.now() < youtubeRateLimitedUntil) return null;

  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "video");
  url.searchParams.set("maxResults", "1");
  url.searchParams.set("q", query);
  url.searchParams.set("key", key);

  const response = await fetchWithRetry(url, { signal: AbortSignal.timeout(5000) }, { attempts: 2, baseDelayMs: 250 });
  if (!response || !response.ok) {
    if (response?.status === 403 || response?.status === 429) youtubeRateLimitedUntil = Date.now() + 60_000;
    return null;
  }

  const payload = (await response.json()) as YouTubeSearchResponse;
  const reason = payload.error?.errors?.[0]?.reason;
  if (reason === "quotaExceeded" || reason === "rateLimitExceeded") {
    youtubeRateLimitedUntil = Date.now() + 60_000;
    return null;
  }

  return payload.items?.[0]?.id?.videoId ?? null;
}

export async function recognizeAudioWithAudd(
  buffer: Buffer,
  filename: string,
  options?: { enableYoutubeLookup?: boolean },
): Promise<ProviderSongMetadata | null> {
  const apiToken = process.env.AUDD_API_TOKEN || process.env.AUDD_API_KEY;
  if (!apiToken) throw new MissingProviderConfigError();

  const formData = new FormData();
  const blob = new Blob([new Uint8Array(buffer)], { type: "audio/webm" });
  formData.append("file", blob, filename || "recording.webm");
  formData.append("api_token", apiToken);
  formData.append("return", "spotify,apple_music");

  const response = await fetchWithRetry(
    process.env.AUDD_API_URL || "https://api.audd.io/",
    { method: "POST", body: formData, signal: AbortSignal.timeout(12000) },
    { attempts: 2, baseDelayMs: 400 },
  );

  if (!response?.ok) return null;

  const payload = (await response.json()) as AuddResponse;
  if (payload.status !== "success" || payload.result === null) return null;

  const artist = readArtist(payload.result.artist);
  const normalizedTitle = normalizeVisibleText(payload.result.title);
  if (!normalizedTitle || !artist) return null;

  const shouldLookupYoutube = options?.enableYoutubeLookup === true;
  const youtubeVideoId = shouldLookupYoutube ? await findYouTubeVideoId(`${normalizedTitle} ${artist} official audio`) : null;

  return {
    songName: normalizedTitle,
    artist,
    album: readAlbum(payload.result.album) || "Unknown Album",
    genre: "Unknown Genre",
    releaseYear: getReleaseYear(payload.result.release_date),
    confidenceScore: 0.85,
    youtubeVideoId: youtubeVideoId ?? undefined,
    platformLinks: {
      youtube: youtubeVideoId ? `https://www.youtube.com/watch?v=${youtubeVideoId}` : undefined,
      appleMusic: payload.result.apple_music?.url,
      spotify: payload.result.spotify?.external_urls?.spotify,
      preview: payload.result.song_link,
    },
  };
}

export async function lookupSongByTitleAndArtist(title: string, artist: string): Promise<ProviderSongMetadata | null> {
  const youtubeVideoId = await findYouTubeVideoId(`${title} ${artist} official audio`);
  if (!youtubeVideoId) return null;
  return {
    songName: title,
    artist,
    album: "Unknown Album",
    genre: "Unknown Genre",
    releaseYear: null,
    confidenceScore: 0.8,
    youtubeVideoId,
    platformLinks: { youtube: `https://www.youtube.com/watch?v=${youtubeVideoId}` },
  };
}
import { normalizeVisibleText } from "../../../utils/text";
