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
  if (!apiKey) {
    return NextResponse.json({ error: "Search unavailable" }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";

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
    const response = await fetch(target.toString(), { cache: "no-store" });
    if (!response.ok) {
      return NextResponse.json([]);
    }

    const payload = (await response.json()) as { items?: YouTubeSearchItem[] };
    const results = (payload.items ?? [])
      .map((item) => {
        const videoId = item.id?.videoId;
        const title = item.snippet?.title;
        const artist = item.snippet?.channelTitle;
        const thumbnailUrl = item.snippet?.thumbnails?.medium?.url;
        if (!videoId || !title || !artist || !thumbnailUrl) return null;

        return {
          videoId,
          title,
          artist,
          thumbnailUrl,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    return NextResponse.json(results);
  } catch {
    return NextResponse.json([]);
  }
}
