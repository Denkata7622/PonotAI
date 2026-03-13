"use client";

import { Heart, MoreHorizontal, Play } from "../icons";
import type { Playlist } from "../../features/library/types";
import type { SongMatch } from "../../features/recognition/api";
import { t, type Language } from "../../lib/translations";

export default function HomeFavoritesSection({
  language,
  favoritesSet,
  favoritesMenuOpen,
  setFavoritesMenuOpen,
  playSong,
  toggleFavorite,
  playlists,
  addToPlaylist,
}: {
  language: Language;
  favoritesSet: Set<string>;
  favoritesMenuOpen: string | null;
  setFavoritesMenuOpen: (value: string | null) => void;
  playSong: (song: SongMatch) => void;
  toggleFavorite: (trackId: string) => void;
  playlists: Playlist[];
  addToPlaylist: (trackId: string, playlistId: string) => void;
}) {
  if (favoritesSet.size === 0) {
    return (
      <section className="rounded-3xl border border-border bg-surface p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <Heart className="w-10 h-10 text-[var(--muted)]" />
          <p className="text-lg font-semibold">{t("empty_favorites_heading", language)}</p>
          <p className="text-sm text-text-muted">{t("empty_favorites_hint", language)}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Your Favorites</h2>
        <span className="text-xs text-text-muted bg-surface rounded-full px-2 py-1">{favoritesSet.size} songs</span>
      </div>
      <div className="space-y-2">
        {Array.from(favoritesSet).slice(0, 6).map((trackId) => {
          const songTitle = trackId.split("-").slice(0, -1).join(" ");
          const coverUrl = `https://picsum.photos/seed/${trackId}/200`;
          const isMenuOpen = favoritesMenuOpen === trackId;
          return (
            <div key={trackId} className="group relative flex items-center gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 transition-all hover:border-[var(--accent)]/50 hover:shadow-lg">
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-[var(--border)]">
                <img src={coverUrl} alt={songTitle} className="h-full w-full object-cover" />
                <button aria-label="Play favorite" onClick={() => playSong({ songName: songTitle, artist: "Favorite", album: "Collection", albumArtUrl: coverUrl, youtubeVideoId: "", genre: "Unknown", releaseYear: null, platformLinks: {}, confidence: 0.5, durationSec: 0 })} className="absolute inset-0 grid place-items-center bg-black/40 opacity-0 transition group-hover:opacity-100"><span className="h-8 w-8 grid place-items-center rounded-full bg-[var(--accent)] text-white"><Play className="w-4 h-4 text-white" /></span></button>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-text-primary truncate text-sm">{songTitle}</p>
                <p className="text-xs text-text-muted">Favorite</p>
              </div>
              <div className="relative">
                <button aria-label="Favorite item options" onClick={() => setFavoritesMenuOpen(isMenuOpen ? null : trackId)} className="rounded-lg p-2 opacity-0 transition group-hover:opacity-100 hover:bg-surface-raised"><MoreHorizontal className="w-4 h-4 text-[var(--muted)]" /></button>
                {isMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-48 rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-lg z-50">
                    <button onClick={() => { toggleFavorite(trackId); setFavoritesMenuOpen(null); }} className="block w-full px-4 py-2 text-left text-sm hover:bg-surface-raised text-text-primary rounded-t-lg">Remove from Favorites</button>
                    {playlists.length > 0 && (<><hr className="border-[var(--border)]" />{playlists.slice(0, 3).map((playlist) => (<button key={playlist.id} onClick={() => { addToPlaylist(trackId, playlist.id); setFavoritesMenuOpen(null); }} className="block w-full px-4 py-2 text-left text-sm hover:bg-surface-raised text-text-primary">Add to {playlist.name}</button>))}</>)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {favoritesSet.size > 6 && <p className="text-xs text-center text-text-muted py-2">+{favoritesSet.size - 6} more in Library</p>}
    </section>
  );
}
