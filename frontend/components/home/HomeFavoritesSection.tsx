"use client";

import { Heart } from "../icons";
import type { Playlist } from "../../features/library/types";
import type { SongMatch } from "../../features/recognition/api";
import type { Track } from "../../features/tracks/types";
import { t, type Language } from "../../lib/translations";
import { normalizeTrackKey } from "../../lib/dedupe";
import SongRow from "../SongRow";

export default function HomeFavoritesSection({
  language,
  favoritesSet,
  playSong,
  toggleFavorite,
  playlists,
  addToPlaylist,
  tracks,
}: {
  language: Language;
  favoritesSet: Set<string>;
  playSong: (song: SongMatch) => void;
  toggleFavorite: (trackId: string, title?: string, artist?: string) => void;
  playlists: Playlist[];
  addToPlaylist: (trackId: string, playlistId: string) => void;
  tracks: Track[];
}) {
  const favoriteTracks = tracks.filter((track) => favoritesSet.has(normalizeTrackKey(track.title, track.artistName))).slice(0, 6);

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
        <h2 className="text-xl font-semibold">{t("library_favorites", language)}</h2>
        <span className="rounded-full bg-surface px-2 py-1 text-xs text-text-muted">{favoritesSet.size}</span>
      </div>
      <div className="space-y-2">
        {favoriteTracks.map((track) => {
          const favoriteKey = normalizeTrackKey(track.title, track.artistName);
          return (
            <SongRow
              key={favoriteKey}
              id={track.id}
              title={track.title}
              artist={track.artistName}
              artworkUrl={track.artworkUrl}
              videoId={track.youtubeVideoId}
              onPlay={() =>
                playSong({
                  songName: track.title,
                  artist: track.artistName,
                  album: "Collection",
                  albumArtUrl: track.artworkUrl,
                  youtubeVideoId: track.youtubeVideoId || "",
                  genre: "Unknown",
                  releaseYear: null,
                  platformLinks: {},
                  confidence: 0.5,
                  durationSec: 0,
                })
              }
              isFavorite
              onFavorite={() => toggleFavorite(track.id, track.title, track.artistName)}
              showMoreMenu
              playlists={playlists}
              onAddToPlaylist={(playlistId) => addToPlaylist(track.id, playlistId)}
            />
          );
        })}
      </div>
    </section>
  );
}
