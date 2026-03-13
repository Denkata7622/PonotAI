"use client";

import type { SongMatch } from "../features/recognition/api";
import { t, type Language } from "../lib/translations";
import { Clock, Play, X } from "./icons";

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
};

export default function HistoryGrid({ language, items, onDelete, onPlay }: HistoryGridProps) {
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
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((entry) => (
            <article key={entry.id} className="group relative overflow-hidden rounded-2xl border border-border bg-surface-overlay transition hover:-translate-y-1 hover:shadow-xl">
              <img src={entry.song.albumArtUrl} alt={t("album_cover", language)} className="h-40 w-full object-cover" />
              <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 opacity-0 transition group-hover:opacity-100">
                {onPlay && (
                  <button
                    onClick={() => onPlay(entry.song)}
                    className="rounded-full bg-[var(--accent)] p-3 text-white transition hover:opacity-90"
                    title={t("btn_play", language)}
                  >
                    <Play className="w-4 h-4 text-white" />
                  </button>
                )}
                <button
                  onClick={() => onDelete(entry.id)}
                  className="rounded-full bg-red-500/75 px-3 py-2 text-xs text-white transition hover:bg-red-600"
                  title={t("history_delete", language)}
                >
                    <X className="w-4 h-4 text-white" />
                </button>
              </div>
              <div className="p-3">
                <p className="truncate text-sm font-semibold">{entry.song.songName}</p>
                <p className="truncate text-xs text-text-muted">{entry.song.artist}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
