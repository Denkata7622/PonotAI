"use client";

import type { SongMatch } from "../features/recognition/api";
import { toSongKey } from "../lib/songIdentity";
import { t, type Language } from "../lib/translations";
import { Clock } from "./icons";
import SongRow from "./SongRow";

type HistoryEntry = {
  id: string;
  createdAt: string;
  song: SongMatch;
};

type HistoryGridProps = {
  language: Language;
  items: HistoryEntry[];
  onDelete: (id: string) => void;
  onPlay?: (song: SongMatch) => void;
  favoritesSet?: Set<string>;
  onFavorite?: (id: string, title?: string, artist?: string) => void;
};

export default function HistoryGrid({ language, items, onDelete, onPlay, favoritesSet = new Set<string>(), onFavorite }: HistoryGridProps) {
  return (
    <section className="rounded-3xl border border-border bg-surface p-6">
      <h2 className="text-2xl font-semibold">{t("history_recent", language)}</h2>
      {items.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-border bg-surface-overlay p-8 text-center">
          <div className="flex flex-col items-center gap-3">
            <Clock className="w-10 h-10 text-[var(--muted)]" />
            <p className="text-lg font-semibold">{t("empty_history_heading", language)}</p>
            <p className="text-sm text-text-muted">{t("empty_history_hint", language)}</p>
          </div>
        </div>
      ) : (
        <div className="mt-5 space-y-2">
          {items.map((entry) => {
            const trackKey = toSongKey({ title: entry.song.songName, artist: entry.song.artist });
            return (
              <SongRow
                key={entry.id}
                id={entry.id}
                title={entry.song.songName}
                artist={entry.song.artist}
                artworkUrl={entry.song.albumArtUrl}
                onPlay={onPlay ? () => onPlay(entry.song) : undefined}
                onDelete={() => onDelete(entry.id)}
                isFavorite={favoritesSet.has(trackKey)}
                onFavorite={onFavorite ? () => onFavorite(trackKey, entry.song.songName, entry.song.artist) : undefined}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
