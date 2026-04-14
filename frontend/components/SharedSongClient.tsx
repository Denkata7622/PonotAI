"use client";

import { useEffect, useState } from "react";
import { Play } from "lucide-react";
import { usePlayer } from "./PlayerProvider";
import { normalizeVisibleText } from "@/lib/text";

type SharedSongPayload = {
  type: "song" | "recognition";
  title: string;
  artist: string;
  album?: string;
  coverUrl?: string;
  sharedBy: string;
  createdAt: string;
  source?: string;
};

type SharedPlaylistPayload = {
  type: "playlist";
  title: string;
  songs: Array<{ title: string; artist: string; album?: string; coverUrl?: string }>;
  songCount: number;
  sharedBy: string;
  createdAt: string;
};

export default function SharedSongClient({ data }: { data: SharedSongPayload | SharedPlaylistPayload }) {
  const [prefetchedVideoId, setPrefetchedVideoId] = useState<string | null>(null);
  const { playNow, addToQueue } = usePlayer();

  const isPlaylist = data.type === "playlist";
  const topSong = isPlaylist ? data.songs[0] : data;
  const normalizedTitle = normalizeVisibleText(data.title);
  const normalizedArtist = !isPlaylist ? normalizeVisibleText(data.artist) : "";

  useEffect(() => {
    if (!topSong) return;
    const query = encodeURIComponent(`${normalizeVisibleText(topSong.title)} ${normalizeVisibleText(topSong.artist)} official audio`);
    fetch(`/api/youtube/resolve?query=${query}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        const videoId = typeof payload?.videoId === "string" ? payload.videoId : null;
        setPrefetchedVideoId(videoId);
      })
      .catch(() => setPrefetchedVideoId(null));
  }, [topSong?.artist, topSong?.title]);

  function handlePlay() {
    if (!topSong) return;
    playNow({
      id: `shared-${topSong.title}-${topSong.artist}`.toLowerCase().replace(/\s+/g, "-"),
      title: normalizeVisibleText(topSong.title),
      artist: normalizeVisibleText(topSong.artist),
      artistId: `artist-${normalizeVisibleText(topSong.artist)}`.toLowerCase().replace(/\s+/g, "-"),
      artworkUrl: topSong.coverUrl || "https://picsum.photos/seed/shared/200",
      license: "COPYRIGHTED",
      query: `${normalizeVisibleText(topSong.title)} ${normalizeVisibleText(topSong.artist)} official audio`,
      videoId: prefetchedVideoId ?? undefined,
    }, "manual");
  }

  function importPlaylist() {
    if (!isPlaylist) return;
    data.songs.forEach((song) => {
      addToQueue({
        title: normalizeVisibleText(song.title),
        artist: normalizeVisibleText(song.artist),
        artistId: normalizeVisibleText(song.artist),
        artworkUrl: song.coverUrl || "https://picsum.photos/seed/shared/200",
        license: "COPYRIGHTED",
        query: `${normalizeVisibleText(song.title)} ${normalizeVisibleText(song.artist)} official audio`,
      });
    });
  }

  return (
    <section className="resultCardAnimated mx-auto max-w-3xl rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6">
      <div className="flex items-start gap-6">
        {topSong?.coverUrl && <img src={topSong.coverUrl} alt={`${topSong.title} cover`} className="h-40 w-40 rounded-2xl object-cover shadow-lg" />}
        <div className="flex-1">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Shared {data.type}</p>
          <h1 className="mt-2 text-3xl font-bold">{normalizedTitle}</h1>
          {!isPlaylist && <p className="mt-2 text-xl text-[var(--text)]/85">{normalizedArtist}</p>}
          {!isPlaylist && <p className="mt-2 text-sm text-[var(--muted)]">{data.album || "Unknown Album"}</p>}
          {data.type === "recognition" && data.source && <p className="mt-2 text-xs text-[var(--muted)]">Mode: {data.source}</p>}
          <p className="mt-4 text-sm text-[var(--muted)]">Shared by {data.sharedBy}</p>

          {isPlaylist && (
            <div className="mt-4 space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-3">
              {data.songs.slice(0, 5).map((song, index) => (
                <p key={`${song.title}-${song.artist}-${index}`} className="text-sm text-[var(--text)]/90">{normalizeVisibleText(song.title)} — {normalizeVisibleText(song.artist)}</p>
              ))}
              {data.songs.length > 5 && <p className="text-xs text-[var(--muted)]">+{data.songs.length - 5} more tracks</p>}
            </div>
          )}

          <div className="mt-6 flex gap-3">
            <button onClick={handlePlay} className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-6 py-3 font-semibold text-[var(--accent-foreground)] transition hover:opacity-90">
              <Play className="w-4 h-4 text-[var(--accent-foreground)]" />
              Play
            </button>
            {isPlaylist && (
              <button onClick={importPlaylist} className="rounded-lg border border-[var(--border)] px-5 py-3 text-sm text-[var(--text)] hover:bg-[var(--hover-bg)]">
                Import to Queue
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
