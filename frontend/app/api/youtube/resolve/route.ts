import { NextRequest, NextResponse } from "next/server";

// This route is called by PlayerProvider when a track has no pre-resolved videoId.
// Requires YOUTUBE_API_KEY to be set in frontend/.env.local (server-side, no NEXT_PUBLIC_ prefix).
// The same key is used by the backend — copy it from backend/.env into frontend/.env.local.

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("query");

  if (!query?.trim()) {
    return NextResponse.json({ videoId: null });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    // Key not configured — return null gracefully; player will display its error state
    // TODO(integration): document YOUTUBE_API_KEY requirement in frontend/.env.local
    return NextResponse.json({ videoId: null });
  }

  try {
    const url = new URL("https://www.googleapis.com/youtube/v3/search");
    url.searchParams.set("part", "snippet");
    url.searchParams.set("type", "video");
    url.searchParams.set("maxResults", "1");
    url.searchParams.set("q", query.trim());
    url.searchParams.set("key", apiKey);

    const res = await fetch(url.toString());
    if (!res.ok) {
      return NextResponse.json({ videoId: null });
    }

    const data = (await res.json()) as {
      items?: Array<{ id?: { videoId?: string } }>;
    };
    const videoId = data.items?.[0]?.id?.videoId ?? null;
    return NextResponse.json({ videoId });
  } catch {
    return NextResponse.json({ videoId: null });
  }
}
