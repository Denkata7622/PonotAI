"use client";

import { useEffect, useState } from "react";
import { use } from "react";
import { usePlayer } from "../../../components/PlayerProvider";
import { getApiBaseUrl } from "@/lib/apiConfig";

type SharedPayload = {
  title: string;
  artist: string;
  album?: string;
  coverUrl?: string;
  sharedBy: string;
  createdAt: string;
};

export default function SharedSongPage({ params }: { params: Promise<{ shareCode: string }> }) {
  const { shareCode } = use(params);
  const [data, setData] = useState<SharedPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { addToQueue } = usePlayer();

  useEffect(() => {
    fetch(`${getApiBaseUrl()}/api/share/${shareCode}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("NOT_FOUND");
        setData((await res.json()) as SharedPayload);
      })
      .catch(() => setError("Shared song not found"));
  }, [shareCode]);

  function handlePlay() {
    if (!data) return;
    addToQueue({
      id: `shared-${data.title}-${data.artist}`.toLowerCase().replace(/\s+/g, "-"),
      title: data.title,
      artistName: data.artist,
      artistId: `artist-${data.artist}`.toLowerCase().replace(/\s+/g, "-"),
      artworkUrl: data.coverUrl || "https://picsum.photos/seed/shared/200",
      license: "COPYRIGHTED",
    });
  }

  if (error) return <section className="card p-6">{error}</section>;
  if (!data) return <section className="card p-6">Loading…</section>;

  return (
    <section className="resultCardAnimated mx-auto max-w-2xl rounded-3xl border border-white/10 bg-white/5 p-6">
      <div className="flex items-start gap-6">
        {data.coverUrl && (
          <img 
            src={data.coverUrl} 
            alt={`${data.title} cover`}
            className="h-40 w-40 rounded-2xl object-cover shadow-lg"
          />
        )}
        <div className="flex-1">
          <p className="text-xs uppercase tracking-[0.2em] text-white/60">Shared song</p>
          <h1 className="mt-2 text-3xl font-bold">{data.title}</h1>
          <p className="mt-2 text-xl text-white/70">{data.artist}</p>
          <p className="mt-2 text-sm text-white/60">{data.album || "Unknown Album"}</p>
          <p className="mt-4 text-sm text-white/50">Shared by {data.sharedBy}</p>
          <button
            onClick={handlePlay}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-6 py-3 font-semibold text-white transition hover:opacity-90"
          >
            ▶ Play
          </button>
        </div>
      </div>
    </section>
  );
}
