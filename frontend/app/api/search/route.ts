// IMPORTANT: This route calls the YouTube Data API v3 which has a daily quota of 10,000 units.
// Each search request costs 100 units. Never remove the minimum query length check or call
// this route without debouncing on the frontend — doing so will exhaust the quota immediately.

import { NextResponse } from "next/server";
import { normalizeVisibleText } from "@/lib/text";
import { parseIsoDurationToSec, rankYouTubeSearchResults } from "@/lib/youtubeSearchRanking";

type YouTubeSearchItem = {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    channelTitle?: string;
    thumbnails?: { medium?: { url?: string } };
  };
};

type YouTubeVideoDetailsItem = {
  id?: string;
  contentDetails?: {
    duration?: string;
  };
};

async function fetchDurationMap(videoIds: string[], apiKey: string): Promise<Record<string, number>> {
  if (videoIds.length === 0) return {};

  const detailsTarget = new URL("https://www.googleapis.com/youtube/v3/videos");
  detailsTarget.searchParams.set("part", "contentDetails");
  detailsTarget.searchParams.set("id", videoIds.join(","));
  detailsTarget.searchParams.set("key", apiKey);

  const detailsRes = await fetch(detailsTarget.toString(), { cache: "no-store" });
  if (!detailsRes.ok) {
    console.error("[search] YouTube video details status", detailsRes.status);
    return {};
  }

  const detailsText = await detailsRes.text();
  const detailsPayload = JSON.parse(detailsText) as { items?: YouTubeVideoDetailsItem[] };
  const durationMap: Record<string, number> = {};
  for (const item of detailsPayload.items ?? []) {
    const id = item.id;
    if (!id) continue;
    const durationSec = parseIsoDurationToSec(item.contentDetails?.duration);
    if (durationSec !== undefined) durationMap[id] = durationSec;
  }
  return durationMap;
}

export async function GET(request: Request) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error: "SEARCH_UNAVAILABLE",
        message: "YouTube search is unavailable because YOUTUBE_API_KEY is not configured.",
      },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";
  if (!query) {
    return NextResponse.json([]);
  }

  if (query.length < 2) {
    return NextResponse.json([]);
  }

  const target = new URL("https://www.googleapis.com/youtube/v3/search");
  target.searchParams.set("part", "snippet");
  target.searchParams.set("type", "video");
  target.searchParams.set("videoCategoryId", "10");
  target.searchParams.set("maxResults", "14");
  target.searchParams.set("q", query);
  target.searchParams.set("key", apiKey);

  try {
    const res = await fetch(target.toString(), { cache: "no-store" });
    const bodyText = await res.text();
    if (!res.ok) {
      console.error("[search] YouTube API error status", res.status);
      return NextResponse.json(
        {
          error: "SEARCH_UPSTREAM_FAILED",
          message: "YouTube search is temporarily unavailable.",
          status: res.status,
        },
        { status: 503 },
      );
    }

    const payload = JSON.parse(bodyText) as { items?: YouTubeSearchItem[] };
    const baseResults = (payload.items ?? [])
      .map((item) => {
        const videoId = item.id?.videoId;
        const title = normalizeVisibleText(item.snippet?.title);
        const channelTitle = normalizeVisibleText(item.snippet?.channelTitle);
        const thumbnailUrl = item.snippet?.thumbnails?.medium?.url;
        if (!videoId || !title || !channelTitle || !thumbnailUrl) return null;

        return { videoId, title, channelTitle, thumbnailUrl };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    const durationMap = await fetchDurationMap(baseResults.map((result) => result.videoId), apiKey);
    const ranked = rankYouTubeSearchResults(
      query,
      baseResults.map((item) => ({
        ...item,
        durationSec: durationMap[item.videoId],
      })),
    );

    return NextResponse.json(ranked.slice(0, 8));
  } catch (error) {
    console.error("[search] Request failed:", error);
    return NextResponse.json(
      {
        error: "SEARCH_REQUEST_FAILED",
        message: "YouTube search request failed.",
      },
      { status: 503 },
    );
  }
}
