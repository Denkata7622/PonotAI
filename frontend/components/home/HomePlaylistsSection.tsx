"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ListMusic, Plus } from "../icons";
import { Button } from "../../src/components/ui/Button";
import type { Playlist } from "../../features/library/types";
import { t, type Language } from "../../lib/translations";
import PlaylistCard from "../PlaylistCard";
import { usePlayer } from "../PlayerProvider";

export default function HomePlaylistsSection({ playlists, language, isAuthenticated, onOpenNewPlaylist, onDeletePlaylist }: { playlists: Playlist[]; language: Language; isAuthenticated: boolean; onOpenNewPlaylist?: () => void; onDeletePlaylist?: (playlistId: string) => void }) {
  const router = useRouter();
  const { addManyToQueue, playNow } = usePlayer();

  if (!isAuthenticated) {
    return (
      <section className="card-base p-8">
        <div className="homeEmptyState flex flex-col items-center gap-3 p-6 text-center">
          <ListMusic className="h-10 w-10 text-[var(--muted)]" />
          <p className="text-lg font-semibold">{language === "bg" ? "Влез, за да управляваш плейлистите си" : "Sign in to manage playlists"}</p>
        </div>
      </section>
    );
  }

  if (playlists.length === 0) {
    return (
      <section className="card-base p-8">
        <div className="homeEmptyState flex flex-col items-center gap-3 p-6 text-center">
          <ListMusic className="h-10 w-10 text-[var(--muted)]" />
          <p className="text-lg font-semibold">{language === "bg" ? "Нямаш плейлисти — създай първия" : "No playlists yet — create your first one"}</p>
          <Button onClick={onOpenNewPlaylist} className="mt-2 flex items-center gap-2" disabled={!onOpenNewPlaylist}>
            <Plus className="h-4 w-4" />
            {t("playlist_new", language)}
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">{t("library_playlists", language)}</h2>
        <div className="flex items-center gap-2">
          <Button onClick={onOpenNewPlaylist} className="flex items-center gap-2" disabled={!onOpenNewPlaylist}>
            <Plus className="h-4 w-4" />
            {t("playlist_new", language)}
          </Button>
          <Link href="/library?tab=playlists" className="text-sm text-text-muted hover:opacity-80">{t("btn_open", language)}</Link>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {playlists.slice(0, 4).map((playlist) => (
          <PlaylistCard
            key={playlist.id}
            playlist={playlist}
            onClick={() => router.push("/library?tab=playlists")}
            onDelete={onDeletePlaylist}
            onPlay={(target) => {
              const [firstSong, ...rest] = target.songs;
              if (!firstSong) return;
              playNow({
                id: `playlist-${firstSong.title}-${firstSong.artist}`.toLowerCase().replace(/\s+/g, "-"),
                title: firstSong.title,
                artist: firstSong.artist,
                artistId: `artist-${firstSong.artist}`.toLowerCase().replace(/\s+/g, "-"),
                artworkUrl: firstSong.coverUrl || "https://picsum.photos/seed/home-playlist/80",
                videoId: firstSong.videoId,
                license: "COPYRIGHTED",
                query: `${firstSong.title} ${firstSong.artist}`,
              }, "playlist");
              if (rest.length > 0) {
                addManyToQueue(
                  rest.map((song) => ({
                    id: `playlist-${song.title}-${song.artist}`.toLowerCase().replace(/\s+/g, "-"),
                    title: song.title,
                    artist: song.artist,
                    artistId: `artist-${song.artist}`.toLowerCase().replace(/\s+/g, "-"),
                    artworkUrl: song.coverUrl || "https://picsum.photos/seed/home-playlist/80",
                    videoId: song.videoId,
                    license: "COPYRIGHTED",
                    query: `${song.title} ${song.artist}`,
                  })),
                  "playlist",
                );
              }
            }}
          />
        ))}
      </div>
    </section>
  );
}
