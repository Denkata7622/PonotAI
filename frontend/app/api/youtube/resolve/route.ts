import { NextRequest, NextResponse } from "next/server";

// This route is called by PlayerProvider when a track has no pre-resolved videoId.
// Requires YOUTUBE_API_KEY to be set in frontend/.env.local (server-side, no NEXT_PUBLIC_ prefix).
// The same key is used by the backend — copy it from backend/.env into frontend/.env.local.

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("query");
  const excludedIds = new Set(
    request.nextUrl.searchParams
      .getAll("exclude")
      .flatMap((value) => value.split(","))
      .map((value) => value.trim())
      .filter(Boolean),
  );

  if (!query?.trim()) {
    return NextResponse.json({ videoId: null, reason: process.env.NODE_ENV !== "production" ? "missing_query" : undefined });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    // Key not configured — return null gracefully; player will display its error state.
    if (process.env.NODE_ENV !== "production") {
      console.warn("[youtube/resolve] Missing YOUTUBE_API_KEY.");
    }
    return NextResponse.json({ videoId: null, reason: process.env.NODE_ENV !== "production" ? "missing_api_key" : undefined });
  }

  try {
    const url = new URL("https://www.googleapis.com/youtube/v3/search");
    url.searchParams.set("part", "snippet");
    url.searchParams.set("type", "video");
    url.searchParams.set("maxResults", "8");
    url.searchParams.set("videoEmbeddable", "true");
    url.searchParams.set("videoSyndicated", "true");
    url.searchParams.set("q", query.trim());
    url.searchParams.set("key", apiKey);

    const res = await fetch(url.toString());
    if (!res.ok) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[youtube/resolve] Upstream request failed", { status: res.status });
      }
      return NextResponse.json({ videoId: null, reason: process.env.NODE_ENV !== "production" ? "upstream_failed" : undefined });
    }

    const data = (await res.json()) as {
      items?: Array<{ id?: { videoId?: string } }>;
    };
    const videoId = data.items?.find((item) => {
      const candidate = item.id?.videoId;
      return candidate && !excludedIds.has(candidate);
    })?.id?.videoId ?? null;
    return NextResponse.json({
      videoId,
      reason: process.env.NODE_ENV !== "production" && !videoId ? "no_match" : undefined,
    });
  } catch {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[youtube/resolve] Unexpected resolver error.");
    }
    return NextResponse.json({ videoId: null, reason: process.env.NODE_ENV !== "production" ? "unexpected_error" : undefined });
  }
}
