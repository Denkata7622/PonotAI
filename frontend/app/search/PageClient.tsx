"use client";

import { useMemo, useState } from "react";
import { scopedKey, useProfile } from "../../lib/ProfileContext";
import { useLanguage } from "../../lib/LanguageContext";
import { t } from "../../lib/translations";

type HistoryItem = {
  id: string;
  song?: { songName?: string; artist?: string };
};

function readHistory(profileId: string): HistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(scopedKey("ponotai-history", profileId)) ?? "[]") as HistoryItem[];
  } catch {
    return [];
  }
}

export default function SearchPage() {
  const { language } = useLanguage();
  const { profile } = useProfile();
  const [query, setQuery] = useState("");
  const history = useMemo(() => readHistory(profile.id), [profile.id]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return history;
    return history.filter((item) => {
      const song = item.song?.songName?.toLowerCase() ?? "";
      const artist = item.song?.artist?.toLowerCase() ?? "";
      return song.includes(q) || artist.includes(q);
    });
  }, [history, query]);

  return (
    <section className="card p-6">
      <h1 className="cardTitle text-2xl font-bold">{t("nav_search", language)}</h1>
      <p className="cardText mt-2">{language === "bg" ? "Търси в историята по песен или изпълнител." : "Search your history by song or artist."}</p>

      <input
        className="mt-4 w-full rounded-xl border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2"
        placeholder={t("history_search_placeholder", language)}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="mt-4 space-y-2">
        {results.length === 0 && <p className="cardText">{t("history_empty", language)}</p>}
        {results.map((item) => (
          <div key={item.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
            <p className="font-medium">{item.song?.songName ?? t("unknown_song", language)}</p>
            <p className="cardText text-sm">{item.song?.artist ?? "-"}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
