"use client";

import { useEffect, useState } from "react";
import { Play } from "lucide-react";
import { usePlayer } from "./PlayerProvider";

type SharedPayload = {
  title: string;
  artist: string;
  album?: string;
  coverUrl?: string;
  sharedBy: string;
  createdAt: string;
};

export default function SharedSongClient({ data }: { data: SharedPayload }) {
  const [prefetchedVideoId, setPrefetchedVideoId] = useState<string | null>(null);
  const { playNow } = usePlayer();

  useEffect(() => {
    const query = encodeURIComponent(`${data.title} ${data.artist} official audio`);
    fetch(`/api/youtube/resolve?query=${query}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        const videoId = typeof payload?.videoId === "string" ? payload.videoId : null;
        setPrefetchedVideoId(videoId);
      })
      .catch(() => setPrefetchedVideoId(null));
  }, [data]);

  function handlePlay() {
    playNow({
      id: `shared-${data.title}-${data.artist}`.toLowerCase().replace(/\s+/g, "-"),
      title: data.title,
      artist: data.artist,
      artistId: `artist-${data.artist}`.toLowerCase().replace(/\s+/g, "-"),
      artworkUrl: data.coverUrl || "https://picsum.photos/seed/shared/200",
      license: "COPYRIGHTED",
      query: `${data.title} ${data.artist} official audio`,
      videoId: prefetchedVideoId ?? undefined,
    }, "manual");
  }

  return (
    <section className="resultCardAnimated mx-auto max-w-2xl rounded-3xl border border-white/10 bg-white/5 p-6">
      <div className="flex items-start gap-6">
        {data.coverUrl && <img src={data.coverUrl} alt={`${data.title} cover`} className="h-40 w-40 rounded-2xl object-cover shadow-lg" />}
        <div className="flex-1">
          <p className="text-xs uppercase tracking-[0.2em] text-white/60">Shared song</p>
          <h1 className="mt-2 text-3xl font-bold">{data.title}</h1>
          <p className="mt-2 text-xl text-white/70">{data.artist}</p>
          <p className="mt-2 text-sm text-white/60">{data.album || "Unknown Album"}</p>
          <p className="mt-4 text-sm text-white/50">Shared by {data.sharedBy}</p>
          <button onClick={handlePlay} className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-6 py-3 font-semibold text-white transition hover:opacity-90">
            <Play className="w-4 h-4 text-white" />
            Play
          </button>
        </div>
      </div>
    </section>
  );
}
