export type SongMatch = {
  songName: string;
  artist: string;
  album: string;
  genre: string;
  releaseYear: number | null;
  platformLinks: {
    youtube?: string;
    youtubeMusic?: string;
    appleMusic?: string;
    spotify?: string;
    preview?: string;
  };
  youtubeVideoId?: string;
  albumArtUrl: string;
  confidence: number;
  durationSec: number;
};

import { getApiBaseUrl } from "@/lib/apiConfig";

export type SongRecognitionResult = SongMatch & {
  source?: "provider" | "ocr_fallback" | "audio" | "image";
  verificationStatus?: "verified" | "not_found";
};

export type AudioRecognitionResult = {
  primaryMatch: SongRecognitionResult;
  alternatives: SongRecognitionResult[];
};

export type ImageRecognitionResult = {
  songs: SongRecognitionResult[];
  count: number;
  language: string;
};

export class RecognitionError extends Error {
  code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "RecognitionError";
    this.code = code;
  }
}

async function postMultipart<T>(
  endpoint: string,
  fieldName: string,
  file: Blob,
  filename: string,
  extraFields?: Record<string, string>,
): Promise<T> {
  const formData = new FormData();
  formData.append(fieldName, file, filename);

  if (extraFields) {
    for (const [key, value] of Object.entries(extraFields)) {
      formData.append(key, value);
    }
  }

  const response = await fetch(`${getApiBaseUrl()}${endpoint}`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    let code: string | undefined;

    try {
      const errorPayload = (await response.json()) as { message?: string; code?: string };
      if (errorPayload.message) message = errorPayload.message;
      code = errorPayload.code;
    } catch {
      // no-op
    }

    throw new RecognitionError(message, code);
  }

  return (await response.json()) as T;
}

export async function recognizeFromAudio(audioBlob: Blob): Promise<AudioRecognitionResult> {
  const primary = await postMultipart<SongRecognitionResult>("/api/recognition/audio", "audio", audioBlob, "recording.webm");
  return { primaryMatch: normalizeSong(primary), alternatives: [] };
}

function normalizeSong(result: SongRecognitionResult): SongRecognitionResult {
  return {
    ...result,
    albumArtUrl: result.albumArtUrl || "https://picsum.photos/seed/recognized/120",
    confidence: typeof result.confidence === "number" ? result.confidence : 1,
    durationSec: typeof result.durationSec === "number" ? result.durationSec : 0,
  };
}


export async function recognizeFromImage(
  imageFile: File,
  maxSongs = 1,
  language = "eng",
): Promise<ImageRecognitionResult> {
  const result = await postMultipart<ImageRecognitionResult>(
    "/api/recognition/image",
    "image",
    imageFile,
    imageFile.name,
    {
      maxSongs: String(maxSongs),
      language,
    },
  );

  const songs = result.songs.map((song) => normalizeSong(song)).slice(0, Math.max(1, maxSongs));
  return {
    songs,
    count: songs.length,
    language: result.language || language,
  };
}
