import type { Metadata } from "next";
import SharedSongClient from "../../../components/SharedSongClient";
import { getApiBaseUrl } from "@/lib/apiConfig";

type SharedPayload = {
  title: string;
  artist: string;
  album?: string;
  coverUrl?: string;
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
    title: `${data.title} — ${data.artist}`,
    description: `Listen to ${data.title} by ${data.artist} on Trackly`,
    openGraph: {
      title: `${data.title} — ${data.artist}`,
      description: `Listen to ${data.title} by ${data.artist} on Trackly`,
      images: data.coverUrl ? [{ url: data.coverUrl }] : undefined,
    },
  };
}

export default async function SharedSongPage({ params }: { params: Promise<{ shareCode: string }> }) {
  const { shareCode } = await params;
  const data = await fetchSharedSong(shareCode);

  if (!data) return <section className="card p-6">Shared song not found</section>;
  return <SharedSongClient data={data} />;
}
