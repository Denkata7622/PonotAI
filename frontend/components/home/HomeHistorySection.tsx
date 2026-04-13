"use client";

import type { SongMatch } from "../../features/recognition/api";
import type { Playlist } from "../../features/library/types";
import { t, type Language } from "../../lib/translations";
import { Clock } from "../icons";
import SongRow from "../SongRow";
import { normalizeTrackKey } from "../../lib/dedupe";

type HistoryEntry = { id: string; source: "audio" | "ocr"; createdAt: string; song: SongMatch };

export default function HomeHistorySection({
  language,
  items,
  onDelete,
  onPlay,
  favoritesSet,
  onFavorite,
  playlists,
  onAddToPlaylist,
}: {
  language: Language;
  items: HistoryEntry[];
  onDelete: (id: string) => void;
  onPlay: (song: SongMatch) => void;
  favoritesSet: Set<string>;
  onFavorite: (id: string, title?: string, artist?: string, artworkUrl?: string, videoId?: string) => void;
  playlists: Playlist[];
  onAddToPlaylist: (song: SongMatch, playlistId: string) => void;
}) {
  return (
    <section className="card-base space-y-3">
      <h2 className="text-2xl font-semibold">{t("history_recent", language)}</h2>
      {items.length === 0 ? (
        <div className="homeEmptyState mt-2 p-8 text-center">
          <div className="flex flex-col items-center gap-3">
            <Clock className="h-10 w-10 text-[var(--muted)]" />
            <p className="text-lg font-semibold">{t("empty_history_heading", language)}</p>
            <p className="text-sm text-text-muted">{t("empty_history_hint", language)}</p>
          </div>
        </div>
      ) : (
        <div className="mt-5 space-y-2">
          {items.map((entry) => {
            const key = normalizeTrackKey(entry.song.songName, entry.song.artist);
            return (
              <SongRow
                key={entry.id}
                id={entry.id}
                title={entry.song.songName}
                artist={entry.song.artist}
                artworkUrl={entry.song.albumArtUrl}
                videoId={entry.song.youtubeVideoId}
                onPlay={() => onPlay(entry.song)}
                onDelete={() => onDelete(entry.id)}
                isFavorite={favoritesSet.has(key)}
                onFavorite={() => onFavorite(entry.id, entry.song.songName, entry.song.artist, entry.song.albumArtUrl, entry.song.youtubeVideoId)}
                showMoreMenu
                playlists={playlists}
                onAddToPlaylist={(playlistId) => onAddToPlaylist(entry.song, playlistId)}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
