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

function readArtist(value: string | { name?: string } | undefined): string | null {
  if (!value) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "object" && "name" in value && typeof value.name === "string") {
    return value.name.trim() || null;
  }
  return null;
}

function readAlbum(value: string | { title?: string } | undefined): string | null {
  if (!value) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "object" && "title" in value && typeof value.title === "string") {
    return value.title.trim() || null;
  }
  return null;
}

type YouTubeSearchResponse = {
  error?: {
    errors?: Array<{ reason?: string }>;
  };
  items?: Array<{ id?: { videoId?: string } }>;
};

type FetchWithRetryOptions = {
  attempts: number;
  baseDelayMs: number;
};

let youtubeRateLimitedUntil = 0;

const analytics = {
  recognitionTotal: 0,
  recognitionSuccess: 0,
};

function logRecognition(success: boolean) {
  analytics.recognitionTotal += 1;
  if (success) analytics.recognitionSuccess += 1;

  if (analytics.recognitionTotal % 10 === 0) {
    const successRate = (analytics.recognitionSuccess / analytics.recognitionTotal) * 100;
    console.info(
      `[analytics] recognition_success_rate=${successRate.toFixed(1)}% (${analytics.recognitionSuccess}/${analytics.recognitionTotal})`,
    );
  }
}

/**
 * Determines whether an HTTP status should be retried.
 * @param status HTTP status code.
 * @returns `true` when status is retryable.
 * @throws Does not throw.
 */
export function shouldRetryStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executes a fetch call with retry-on-failure semantics.
 * @param input URL or URL string for the request.
 * @param init Fetch init options.
 * @param options Retry configuration.
 * @returns Promise resolving to a response, or `null` if attempts are exhausted.
 * @throws Does not throw intentionally for retryable failures; network errors are swallowed and retried.
 */
export async function fetchWithRetry(
  input: URL | string,
  init: RequestInit,
  options: FetchWithRetryOptions,
): Promise<Response | null> {
  let attempt = 0;

  while (attempt < options.attempts) {
    attempt += 1;
    try {
      const response = await fetch(input, init);
      if (!shouldRetryStatus(response.status)) {
        return response;
      }
    } catch {
      // retry network failures
    }

    if (attempt < options.attempts) {
      await delay(options.baseDelayMs * 2 ** (attempt - 1));
    }
  }

  return null;
}

function getReleaseYear(releaseDate?: string): number | null {
  if (!releaseDate) return null;
  const parsed = new Date(releaseDate);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getUTCFullYear();
}

async function findYouTubeVideoId(query: string): Promise<string | null> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key || !query.trim()) return null;

  if (Date.now() < youtubeRateLimitedUntil) {
    return null;
  }

  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "video");
  url.searchParams.set("maxResults", "1");
  url.searchParams.set("q", query);
  url.searchParams.set("key", key);

  const response = await fetchWithRetry(url, { signal: AbortSignal.timeout(5000) }, { attempts: 3, baseDelayMs: 300 });
  if (!response || !response.ok) {
    if (response?.status === 403) {
      youtubeRateLimitedUntil = Date.now() + 60_000;
      console.warn("[youtube] quota/rate limit detected; suppressing calls for 60s");
    }
    return null;
  }

  const payload = (await response.json()) as YouTubeSearchResponse;
  const reason = payload.error?.errors?.[0]?.reason;
  if (reason === "quotaExceeded" || reason === "rateLimitExceeded") {
    youtubeRateLimitedUntil = Date.now() + 60_000;
    console.warn(`[youtube] ${reason}; suppressing calls for 60s`);
    return null;
  }

  return payload.items?.[0]?.id?.videoId ?? null;
}

/**
 * Recognizes an audio clip using the AuDD provider API.
 * @param buffer Audio file buffer.
 * @param filename Original upload filename.
 * @returns Promise resolving to normalized provider metadata, or `null` when no match is found.
 * @throws MissingProviderConfigError when required AuDD credentials are not configured.
 */
export async function recognizeAudioWithAudd(buffer: Buffer, filename: string): Promise<ProviderSongMetadata | null> {
  const apiToken = process.env.AUDD_API_TOKEN || process.env.AUDD_API_KEY;
  if (!apiToken) {
    throw new MissingProviderConfigError();
  }

  const formData = new FormData();
  const blob = new Blob([new Uint8Array(buffer)], { type: "audio/webm" });
  formData.append("file", blob, filename || "recording.webm");
  formData.append("api_token", apiToken);
  formData.append("return", "spotify,apple_music");

  const response = await fetchWithRetry(
    process.env.AUDD_API_URL || "https://api.audd.io/",
    { method: "POST", body: formData, signal: AbortSignal.timeout(12000) },
    { attempts: 3, baseDelayMs: 400 },
  );

  if (!response?.ok) {
    logRecognition(false);
    return null;
  }

  const payload = (await response.json()) as AuddResponse;
  if (payload.status !== "success" || payload.result === null) {
    logRecognition(false);
    return null;
  }

  const artist = readArtist(payload.result.artist);
  if (!payload.result.title || !artist) {
    logRecognition(false);
    return null;
  }

  const youtubeVideoId = await findYouTubeVideoId(`${payload.result.title} ${artist} official audio`);

  const result: ProviderSongMetadata = {
    songName: payload.result.title,
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

  logRecognition(Boolean(youtubeVideoId));
  return result;
}

/**
 * Resolves a song by title and artist via YouTube lookup enrichment.
 * @param title Candidate song title.
 * @param artist Candidate artist name.
 * @returns Promise resolving to provider metadata, or `null` when no YouTube match is found.
 * @throws Propagates unexpected fetch parsing failures.
 */
export async function lookupSongByTitleAndArtist(title: string, artist: string): Promise<ProviderSongMetadata | null> {
  const youtubeVideoId = await findYouTubeVideoId(`${title} ${artist} official audio`);

  if (!youtubeVideoId) {
    return null;
  }

  return {
    songName: title,
    artist,
    album: "Unknown Album",
    genre: "Unknown Genre",
    releaseYear: null,
    confidenceScore: 0.8,
    youtubeVideoId,
    platformLinks: {
      youtube: `https://www.youtube.com/watch?v=${youtubeVideoId}`,
    },
  };
}
