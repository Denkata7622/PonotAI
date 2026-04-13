import { GoogleGenerativeAI } from "@google/generative-ai";

export type AiOcrSuccess = {
  status: "success";
  songs: Array<{
    title: string;
    artist: string;
    confidenceScore: number;
  }>;
};

export type AiOcrUnavailable = {
  status: "unavailable";
  reason: "missing_api_key" | "empty_response" | "provider_error" | "invalid_payload";
};

export type AiOcrResult = AiOcrSuccess | AiOcrUnavailable;

function getGeminiApiKey(): string | null {
  const key = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();
  return key || null;
}

function clampConfidence(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0.25, Math.min(0.95, parsed)) : 0.7;
}

function parseAiJson(rawText: string): AiOcrSuccess | null {
  const cleaned = rawText.trim().replace(/^```json\s*/i, "").replace(/^```/, "").replace(/```$/, "").trim();
  const parsed = JSON.parse(cleaned) as {
    title?: unknown;
    artist?: unknown;
    confidenceScore?: unknown;
    confidence?: unknown;
    songs?: Array<{ title?: unknown; artist?: unknown; confidenceScore?: unknown; confidence?: unknown }>;
  };

  const songsPayload = Array.isArray(parsed.songs)
    ? parsed.songs
    : [{ title: parsed.title, artist: parsed.artist, confidenceScore: parsed.confidenceScore ?? parsed.confidence }];

  const songs = songsPayload
    .map((song) => {
      const title = typeof song.title === "string" ? song.title.trim() : "";
      if (!title) return null;
      const artist = typeof song.artist === "string" ? song.artist.trim() : "";
      return {
        title,
        artist: artist || "Unknown Artist",
        confidenceScore: clampConfidence(song.confidenceScore ?? song.confidence),
      };
    })
    .filter((song): song is NonNullable<typeof song> => Boolean(song));

  if (songs.length === 0) return null;
  return { status: "success", songs };
}

export async function extractMetadataWithAiOcr(buffer: Buffer, mimeType = "image/jpeg"): Promise<AiOcrResult> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    return { status: "unavailable", reason: "missing_api_key" };
  }

  try {
    const client = new GoogleGenerativeAI(apiKey);
    const model = client.getGenerativeModel({
      model: process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash",
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
      },
    });

    const visionModel = model as unknown as {
      generateContent: (payload: {
        contents: Array<{
          role: "user";
          parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }>;
        }>;
      }) => Promise<{ response?: { text?: () => string } }>;
    };

    const result = await visionModel.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: "Extract up to 15 song candidates from this image. Return strict JSON with `songs` array. Each item needs: title (string), artist (string), confidenceScore (0-1). Sort best to worst and exclude duplicates.",
            },
            {
              inlineData: {
                mimeType,
                data: buffer.toString("base64"),
              },
            },
          ],
        },
      ],
    });

    const text = result.response?.text?.() ?? "";
    if (!text.trim()) return { status: "unavailable", reason: "empty_response" };

    const parsed = parseAiJson(text);
    if (!parsed) return { status: "unavailable", reason: "invalid_payload" };
    return parsed;
  } catch {
    return { status: "unavailable", reason: "provider_error" };
  }
}
