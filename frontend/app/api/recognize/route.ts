import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/apiConfig";

type RecognizeResponse = {
  trackId: string;
  title: string;
  artist: {
    id: string;
    name: string;
  };
  license: "FREE" | "COPYRIGHTED";
  artworkUrl?: string;
};

export const LOCAL_FALLBACKS: RecognizeResponse[] = [
  {
    trackId: "local_blinding_lights",
    title: "Blinding Lights",
    artist: { id: "a1", name: "The Weeknd" },
    license: "COPYRIGHTED",
    artworkUrl:
      "https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=600&q=80",
  },
  {
    trackId: "local_morning_sun",
    title: "Morning Sun",
    artist: { id: "a2", name: "Luna Waves" },
    license: "FREE",
    artworkUrl: "https://picsum.photos/seed/ponotai-api-fallback/600",
  },
];

export async function POST() {
  try {
        const upstream = await fetch(`${getApiBaseUrl()}/recognize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });

    if (upstream.ok) {
      const data = (await upstream.json()) as RecognizeResponse;
      return NextResponse.json(data, { status: 200 });
    }
  } catch {
    // fall through to local fallback response
  }

  const sample = LOCAL_FALLBACKS[Math.floor(Math.random() * LOCAL_FALLBACKS.length)];
  return NextResponse.json(sample, {
    status: 200,
    headers: {
      "x-ponotai-fallback": "true",
    },
  });
}
