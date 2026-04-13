import type { Metadata } from "next";
import SharedSongClient from "../../../components/SharedSongClient";
import { getApiBaseUrl } from "@/lib/apiConfig";
import { normalizeVisibleText } from "@/lib/text";

type SharedPayload =
  | {
      type: "song" | "recognition";
      title: string;
      artist: string;
      album?: string;
      coverUrl?: string;
      sharedBy: string;
      createdAt: string;
      source?: string;
    }
  | {
      type: "playlist";
      title: string;
      songs: Array<{ title: string; artist: string; album?: string; coverUrl?: string }>;
      songCount: number;
      sharedBy: string;
      createdAt: string;
    };

async function fetchSharedSong(shareCode: string): Promise<SharedPayload | null> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/share/${shareCode}`, { cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as SharedPayload;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ shareCode: string }> }): Promise<Metadata> {
  const { shareCode } = await params;
  const data = await fetchSharedSong(shareCode);

  if (!data) {
    return {
      title: "Shared song",
    };
  }

  return {
      title: `${normalizeVisibleText(data.title)}${data.type === "playlist" ? "" : ` — ${normalizeVisibleText(data.artist)}`}`,
    description: `Open shared ${data.type} on Trackly`,
    openGraph: {
      title: `${normalizeVisibleText(data.title)}${data.type === "playlist" ? "" : ` — ${normalizeVisibleText(data.artist)}`}`,
      description: `Open shared ${data.type} on Trackly`,
      images: "coverUrl" in data && data.coverUrl ? [{ url: data.coverUrl }] : undefined,
    },
  };
}

export default async function SharedSongPage({ params }: { params: Promise<{ shareCode: string }> }) {
  const { shareCode } = await params;
  const data = await fetchSharedSong(shareCode);

  if (!data) return <section className="card p-6">Shared song not found</section>;
  return <SharedSongClient data={data} />;
}
