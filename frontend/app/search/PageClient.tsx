"use client";

import { useEffect, useMemo, useState } from "react";
import { Play, Plus, Search, WifiOff } from "lucide-react";
import SearchInput from "../../components/SearchInput";
import { usePlayer } from "../../components/PlayerProvider";
import { scopedKey, useProfile } from "../../lib/ProfileContext";
import { useLanguage } from "../../lib/LanguageContext";
import { t } from "../../lib/translations";

type HistoryItem = {
  id: string;
  song?: { songName?: string; artist?: string };
};

type SearchResult = {
  videoId: string;
  title: string;
  artist: string;
  thumbnailUrl: string;
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
  const { addToQueue } = usePlayer();
  const [activeTab, setActiveTab] = useState<"discover" | "history">("discover");
  const [query, setQuery] = useState("");
  const [historyQuery, setHistoryQuery] = useState("");
  const [discoverResults, setDiscoverResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUnavailable, setIsUnavailable] = useState(false);
  const history = useMemo(() => readHistory(profile.id), [profile.id]);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setDiscoverResults([]);
      setIsUnavailable(false);
      return;
    }

    const timeout = window.setTimeout(async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        if (response.status === 503) {
          setIsUnavailable(true);
          setDiscoverResults([]);
          return;
        }
        setIsUnavailable(false);
        const payload = response.ok ? ((await response.json()) as SearchResult[]) : [];
        setDiscoverResults(Array.isArray(payload) ? payload : []);
      } catch {
        setIsUnavailable(true);
        setDiscoverResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 400);

    return () => window.clearTimeout(timeout);
  }, [query]);

  const historyResults = useMemo(() => {
    const q = historyQuery.trim().toLowerCase();
    if (!q) return history;
    return history.filter((item) => {
      const song = item.song?.songName?.toLowerCase() ?? "";
      const artist = item.song?.artist?.toLowerCase() ?? "";
      return song.includes(q) || artist.includes(q);
    });
  }, [history, historyQuery]);

  function queueResult(result: SearchResult) {
    addToQueue({
      title: result.title,
      artist: result.artist,
      artistId: result.videoId,
      artworkUrl: result.thumbnailUrl,
      videoId: result.videoId,
      query: `${result.title} ${result.artist}`,
      license: "COPYRIGHTED",
    });
  }

  return (
    <section className="card p-6">
      <h1 className="cardTitle text-2xl font-bold">{t("nav_search", language)}</h1>

      <div className="mt-4 inline-flex rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1">
        <button
          className={`rounded-lg px-4 py-2 text-sm ${activeTab === "discover" ? "bg-[var(--active-bg)]" : "text-[var(--muted)]"}`}
          onClick={() => setActiveTab("discover")}
        >
          {t("search_discover", language)}
        </button>
        <button
          className={`rounded-lg px-4 py-2 text-sm ${activeTab === "history" ? "bg-[var(--active-bg)]" : "text-[var(--muted)]"}`}
          onClick={() => setActiveTab("history")}
        >
          {t("search_history", language)}
        </button>
      </div>

      {activeTab === "discover" ? (
        <div className="mt-4 space-y-4">
          <SearchInput
            value={query}
            onChange={setQuery}
            onClear={() => setQuery("")}
            placeholder={t("search_placeholder", language)}
          />

          {isUnavailable && (
            <p className="cardText inline-flex items-center gap-2">
              <WifiOff className="w-4 h-4 text-[var(--muted)]" />
              {t("search_unavailable", language)}
            </p>
          )}
          {!isUnavailable && isLoading && <Search className="h-5 w-5 animate-spin text-[var(--muted)]" />}
          {!isUnavailable && !isLoading && query.trim().length > 0 && discoverResults.length === 0 && (
            <p className="cardText">{t("search_no_results", language)}</p>
          )}

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {discoverResults.map((result) => (
              <article key={result.videoId} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                <img src={result.thumbnailUrl} alt={result.title} className="h-32 w-full rounded-lg object-cover" />
                <p className="mt-2 line-clamp-2 text-sm font-semibold">{result.title}</p>
                <p className="text-xs text-[var(--muted)]">{result.artist}</p>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    className="rounded-lg border border-[var(--border)] p-2 hover:bg-[var(--hover-bg)]"
                    onClick={() => queueResult(result)}
                    aria-label={t("btn_play", language)}
                  >
                    <Play className="h-4 w-4" />
                  </button>
                  <button
                    className="rounded-lg border border-[var(--border)] p-2 hover:bg-[var(--hover-bg)]"
                    onClick={() => queueResult(result)}
                    aria-label={t("btn_add_to_queue", language)}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <SearchInput
            value={historyQuery}
            onChange={setHistoryQuery}
            onClear={() => setHistoryQuery("")}
            placeholder={t("history_search_placeholder", language)}
          />
          <div className="mt-4 space-y-2">
            {historyResults.length === 0 && <p className="cardText">{t("history_empty", language)}</p>}
            {historyResults.map((item) => (
              <div key={item.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                <p className="font-medium">{item.song?.songName ?? t("unknown_song", language)}</p>
                <p className="cardText text-sm">{item.song?.artist ?? "-"}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
