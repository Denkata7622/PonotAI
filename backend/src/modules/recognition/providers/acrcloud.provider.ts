import crypto from "crypto";
import { fetchWithRetry, type ProviderSongMetadata } from "./audd.provider";

export class MissingAcrCloudConfigError extends Error {
  constructor(message = "Missing ACRCloud configuration. Set ACRCLOUD_ACCESS_KEY, ACRCLOUD_ACCESS_SECRET and ACRCLOUD_HOST.") {
    super(message);
    this.name = "MissingAcrCloudConfigError";
  }
}

type AcrCloudResponse = {
  status?: { code?: number; msg?: string };
  metadata?: {
    music?: Array<{
      title?: string;
      score?: number;
      artists?: Array<{ name?: string }>;
      album?: { name?: string };
      genres?: Array<{ name?: string }>;
      release_date?: string;
      external_ids?: {
        youtube?: { vid?: string };
      };
      external_metadata?: {
        spotify?: {
          track?: {
            id?: string;
          };
        };
      };
    }>;
  };
};

function getReleaseYear(releaseDate?: string): number | null {
  if (!releaseDate) return null;
  const parsed = new Date(releaseDate);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getUTCFullYear();
}

function buildSignature(accessKey: string, accessSecret: string, dataType: string, signatureVersion: string, timestamp: string): string {
  const stringToSign = ["POST", "/v1/identify", accessKey, dataType, signatureVersion, timestamp].join("\n");
  return crypto.createHmac("sha1", accessSecret).update(stringToSign).digest("base64");
}

/**
 * Recognizes an audio clip using ACRCloud identify API.
 * @param buffer Audio file buffer.
 * @param filename Original upload filename.
 * @returns Promise resolving to normalized provider metadata, or `null` when no match is found.
 * @throws MissingAcrCloudConfigError when required ACRCloud env configuration is missing.
 */
export async function recognizeWithAcrCloud(buffer: Buffer, filename: string): Promise<ProviderSongMetadata | null> {
  const accessKey = process.env.ACRCLOUD_ACCESS_KEY?.trim();
  const accessSecret = process.env.ACRCLOUD_ACCESS_SECRET?.trim();
  const host = process.env.ACRCLOUD_HOST?.trim();

  if (!accessKey || !accessSecret || !host) {
    throw new MissingAcrCloudConfigError();
  }

  const endpoint = host.startsWith("http") ? host : `https://${host}`;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const dataType = "audio";
  const signatureVersion = "1";
  const signature = buildSignature(accessKey, accessSecret, dataType, signatureVersion, timestamp);

  const formData = new FormData();
  const blob = new Blob([new Uint8Array(buffer)], { type: "audio/webm" });
  formData.append("sample", blob, filename || "recording.webm");
  formData.append("access_key", accessKey);
  formData.append("data_type", dataType);
  formData.append("signature_version", signatureVersion);
  formData.append("signature", signature);
  formData.append("sample_bytes", buffer.byteLength.toString());
  formData.append("timestamp", timestamp);

  const response = await fetchWithRetry(
    `${endpoint.replace(/\/$/, "")}/v1/identify`,
    { method: "POST", body: formData, signal: AbortSignal.timeout(15000) },
    { attempts: 2, baseDelayMs: 350 },
  );

  if (!response) {
    throw new Error("ACRCloud request failed due to network timeout.");
  }

  if (!response.ok) {
    throw new Error(`ACRCloud request failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as AcrCloudResponse;
  const topMatch = payload.metadata?.music?.[0];

  if (!topMatch?.title || !topMatch.artists?.[0]?.name) {
    return null;
  }

  const artist = topMatch.artists.map((entry) => entry.name).filter(Boolean).join(", ").trim();
  if (!artist) {
    return null;
  }

  const youtubeVideoId = topMatch.external_ids?.youtube?.vid;
  const spotifyId = topMatch.external_metadata?.spotify?.track?.id;
  const confidence = typeof topMatch.score === "number" ? Math.max(0, Math.min(1, topMatch.score / 100)) : 0.8;

  return {
    songName: topMatch.title.trim(),
    artist,
    album: topMatch.album?.name?.trim() || "Unknown Album",
    genre: topMatch.genres?.[0]?.name?.trim() || "Unknown Genre",
    releaseYear: getReleaseYear(topMatch.release_date),
    confidenceScore: confidence,
    youtubeVideoId: youtubeVideoId || undefined,
    platformLinks: {
      youtube: youtubeVideoId ? `https://www.youtube.com/watch?v=${youtubeVideoId}` : undefined,
      spotify: spotifyId ? `https://open.spotify.com/track/${spotifyId}` : undefined,
    },
  };
}
