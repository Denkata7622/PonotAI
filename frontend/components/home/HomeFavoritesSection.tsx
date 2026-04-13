"use client";

import { Heart } from "../icons";
import type { Playlist, StoredFavorite } from "../../features/library/types";
import type { SongMatch } from "../../features/recognition/api";
import type { Track } from "../../features/tracks/types";
import { t, type Language } from "../../lib/translations";
import SongRow from "../SongRow";

export default function HomeFavoritesSection({
  language,
  favoritesList,
  playSong,
  toggleFavorite,
  playlists,
  addToPlaylist,
  tracks,
}: {
  language: Language;
  favoritesList: StoredFavorite[];
  playSong: (song: SongMatch) => void;
  toggleFavorite: (trackId: string, title?: string, artist?: string, artworkUrl?: string, videoId?: string) => void;
  playlists: Playlist[];
  addToPlaylist: (trackId: string, playlistId: string) => void;
  tracks: Track[];
}) {
  const favoriteTracks = favoritesList.slice(0, 6);

  if (favoriteTracks.length === 0) {
    return (
      <section className="card-base p-8">
        <div className="homeEmptyState flex flex-col items-center gap-3 p-6 text-center">
          <Heart className="h-10 w-10 text-[var(--muted)]" />
          <p className="text-lg font-semibold">{t("empty_favorites_heading", language)}</p>
          <p className="text-sm text-text-muted">{t("empty_favorites_hint", language)}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{t("library_favorites", language)}</h2>
        <span className="rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-2 py-1 text-xs text-[var(--text)]">{favoritesList.length}</span>
      </div>
      <div className="space-y-2">
        {favoriteTracks.map((favorite) => {
          return (
            <SongRow
              key={favorite.key}
              id={favorite.key}
              title={favorite.title}
              artist={favorite.artist}
              artworkUrl={favorite.artworkUrl}
              videoId={favorite.videoId}
              onPlay={() =>
                playSong({
                  songName: favorite.title,
                  artist: favorite.artist,
                  album: "Collection",
                  albumArtUrl: favorite.artworkUrl ?? "https://picsum.photos/seed/favorites/80",
                  youtubeVideoId: favorite.videoId || "",
                  genre: "Unknown",
                  releaseYear: null,
                  platformLinks: {},
                  confidence: 0.5,
                  durationSec: 0,
                })
              }
              isFavorite
              onFavorite={() => toggleFavorite(favorite.key, favorite.title, favorite.artist, favorite.artworkUrl, favorite.videoId)}
              showMoreMenu
              playlists={playlists}
              onAddToPlaylist={(playlistId) => {
                const matchingTrack = tracks.find((track) => track.title === favorite.title && track.artistName === favorite.artist);
                addToPlaylist(matchingTrack?.id ?? favorite.key, playlistId);
              }}
            />
          );
        })}
      </div>
    </section>
  );
}
