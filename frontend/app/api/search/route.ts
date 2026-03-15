import { NextResponse } from "next/server";

type YouTubeSearchItem = {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    channelTitle?: string;
    thumbnails?: { medium?: { url?: string } };
  };
};

export async function GET(request: Request) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  console.log("[search] key present:", Boolean(apiKey));

  if (!apiKey) {
    return NextResponse.json({ error: "Search unavailable", reason: "no_key" }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";
  console.log("[search] query:", query);

  if (!query) {
    return NextResponse.json([]);
  }

  const target = new URL("https://www.googleapis.com/youtube/v3/search");
  target.searchParams.set("part", "snippet");
  target.searchParams.set("type", "video");
  target.searchParams.set("videoCategoryId", "10");
  target.searchParams.set("maxResults", "8");
  target.searchParams.set("q", query);
  target.searchParams.set("key", apiKey);

  try {
    const res = await fetch(target.toString(), { cache: "no-store" });
    const bodyText = await res.text();
    console.log("[search] YouTube status:", res.status);
    console.log("[search] YouTube body:", bodyText.slice(0, 500));

    if (!res.ok) {
      const ytError = JSON.parse(bodyText).catch?.(() => ({})) ?? {};
      console.error("[search] YouTube API error:", ytError);
      return NextResponse.json(
        { error: "Search unavailable", reason: "youtube_error", details: ytError },
        { status: 503 },
      );
    }

    const payload = JSON.parse(bodyText) as { items?: YouTubeSearchItem[] };
    const results = (payload.items ?? [])
      .map((item) => {
        const videoId = item.id?.videoId;
        const title = item.snippet?.title;
        const artist = item.snippet?.channelTitle;
        const thumbnailUrl = item.snippet?.thumbnails?.medium?.url;
        if (!videoId || !title || !artist || !thumbnailUrl) return null;

        return { videoId, title, artist, thumbnailUrl };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    return NextResponse.json(results);
  } catch (error) {
    console.error("[search] Request failed:", error);
    return NextResponse.json(
      { error: "Search unavailable", reason: "youtube_error" },
      { status: 503 },
    );
  }
}