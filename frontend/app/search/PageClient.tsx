"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock, Play, Search, TrendingUp, WifiOff, X } from "../../lucide-react";
import SearchInput from "../../components/SearchInput";
import SearchResultActions from "../../components/SearchResultActions";
import { usePlayer } from "../../components/PlayerProvider";
import { scopedKey, useProfile } from "../../lib/ProfileContext";
import { useLanguage } from "../../lib/LanguageContext";
import { t } from "../../lib/translations";
import { useLibrary } from "../../features/library/useLibrary";
import { useUser } from "../../src/context/UserContext";
import { useRouter } from "next/navigation";
import { useRecentSearches } from "../../lib/useRecentSearches";

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
  const router = useRouter();
  const { language } = useLanguage();
  const { profile } = useProfile();
  const { addToQueue } = usePlayer();
  const { addFavorite } = useUser();
  const { playlists, addSongToPlaylist } = useLibrary(profile.id);
  const { recentSearches, saveQuery, clearRecent, removeRecent } = useRecentSearches();
  const suggestedQueries = ["Азис", "Глория", "Слави Трифонов", "Преслава", "Sabaton", "Linkin Park", "The Weeknd", "Eminem"];
  const [activeTab, setActiveTab] = useState<"discover" | "history">("discover");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [historyQuery, setHistoryQuery] = useState("");
  const [discoverResults, setDiscoverResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUnavailable, setIsUnavailable] = useState(false);
  const [openActionsId, setOpenActionsId] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const history = useMemo(() => readHistory(profile.id), [profile.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 500);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const q = debouncedQuery.trim();
    if (!q) {
      setDiscoverResults([]);
      setIsUnavailable(false);
      setIsLoading(false);
      return;
    }

    async function runSearch() {
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
        saveQuery(q);
      } catch {
        setIsUnavailable(true);
        setDiscoverResults([]);
      } finally {
        setIsLoading(false);
      }
    }

    void runSearch();
  }, [debouncedQuery, saveQuery]);

  const historyResults = useMemo(() => {
    const q = historyQuery.trim().toLowerCase();
    if (!q) return history;
    return history.filter((item) => {
      const song = item.song?.songName?.toLowerCase() ?? "";
      const artist = item.song?.artist?.toLowerCase() ?? "";
      return song.includes(q) || artist.includes(q);
    });
  }, [history, historyQuery]);

  const groupedResults = useMemo(() => ({
    songs: discoverResults.filter((result) => !result.artist.endsWith("- Topic")),
    channels: discoverResults.filter((result) => result.artist.endsWith("- Topic")),
  }), [discoverResults]);

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
        <button className={`rounded-lg px-4 py-2 text-sm ${activeTab === "discover" ? "bg-[var(--active-bg)]" : "text-[var(--muted)]"}`} onClick={() => setActiveTab("discover")}>{t("search_discover", language)}</button>
        <button className={`rounded-lg px-4 py-2 text-sm ${activeTab === "history" ? "bg-[var(--active-bg)]" : "text-[var(--muted)]"}`} onClick={() => setActiveTab("history")}>{t("search_history", language)}</button>
      </div>

      {activeTab === "discover" ? (
        <div className="mt-4 space-y-4">
          <div className="relative">
            <SearchInput
              value={query}
              onChange={setQuery}
              onClear={() => setQuery("")}
              placeholder={t("search_placeholder", language)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => window.setTimeout(() => setIsFocused(false), 200)}
            />

            {isFocused && !query.trim() && (
              <div className="absolute z-[9999] mt-2 w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-2 shadow-2xl">
                {recentSearches.length > 0 ? (
                  <>
                    <div className="mb-1 flex items-center justify-between px-2 py-1">
                      <p className="inline-flex items-center gap-2 text-sm text-[var(--muted)]"><Clock className="w-4 h-4 text-[var(--muted)]" />{t("search_recent", language)}</p>
                      <button type="button" className="text-xs text-[var(--muted)] hover:text-[var(--text)]" onMouseDown={(event) => event.preventDefault()} onClick={clearRecent}>{t("search_clear_recent", language)}</button>
                    </div>
                    <ul className="space-y-1">
                      {recentSearches.map((item) => (
                        <li key={item} className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-[var(--hover-bg)]">
                          <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onMouseDown={(event) => event.preventDefault()} onClick={() => setQuery(item)}><Clock className="w-4 h-4 text-[var(--muted)]" /><span className="truncate text-sm">{item}</span></button>
                          <button type="button" className="rounded-full p-1 hover:bg-[var(--hover-bg)]" onMouseDown={(event) => event.preventDefault()} onClick={() => removeRecent(item)}><X className="w-3 h-3 text-[var(--muted)]" /></button>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <>
                    <p className="mb-2 inline-flex items-center gap-2 px-2 text-sm text-[var(--muted)]"><TrendingUp className="w-4 h-4 text-[var(--muted)]" />{t("search_suggested", language)}</p>
                    <div className="flex flex-wrap gap-2 px-2 pb-1">
                      {suggestedQueries.map((item) => (
                        <button key={item} type="button" className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-sm hover:bg-[var(--hover-bg)]" onMouseDown={(event) => event.preventDefault()} onClick={() => setQuery(item)}>{item}</button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {isUnavailable && <p className="cardText inline-flex items-center gap-2"><WifiOff className="w-4 h-4 text-[var(--muted)]" />{t("search_unavailable", language)}</p>}
          {!isUnavailable && (query !== debouncedQuery || isLoading) && <Search className="h-5 w-5 animate-spin text-[var(--muted)]" />}
          {!isUnavailable && !isLoading && query === debouncedQuery && query.trim().length > 0 && discoverResults.length === 0 && <p className="cardText">{t("search_no_results", language)}</p>}

          {discoverResults.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-wider text-[var(--muted)]">Songs</p>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {groupedResults.songs.map((result) => (
                  <article key={result.videoId} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                    <img src={result.thumbnailUrl} alt={result.title} className="h-32 w-full rounded-lg object-cover" />
                    <p className="mt-2 line-clamp-2 text-sm font-semibold">{result.title}</p>
                    <p className="text-xs text-[var(--muted)]">{result.artist}</p>
                    <div className="mt-3 flex items-center gap-2">
                      <button className="rounded-lg border border-[var(--border)] p-2 hover:bg-[var(--hover-bg)]" onClick={() => queueResult(result)} aria-label={t("btn_play", language)}><Play className="h-4 w-4 text-[var(--text)]" /></button>
                      <SearchResultActions resultId={result.videoId} isOpen={openActionsId === result.videoId} onToggle={() => setOpenActionsId((prev) => prev === result.videoId ? null : result.videoId)} onClose={() => setOpenActionsId(null)} onPlayNow={() => queueResult(result)} onAddToQueue={() => queueResult(result)} onAddToFavorites={() => addFavorite({ title: result.title, artist: result.artist, coverUrl: result.thumbnailUrl })} onAddToPlaylist={(playlistId) => addSongToPlaylist(playlistId, { title: result.title, artist: result.artist, coverUrl: result.thumbnailUrl, videoId: result.videoId })} playlists={playlists} onGoToLibrary={() => router.push('/library')} />
                    </div>
                  </article>
                ))}
              </div>

              {groupedResults.channels.length > 0 && (
                <>
                  <hr className="border-[var(--border)]" />
                  <p className="text-xs uppercase tracking-wider text-[var(--muted)]">Artists & Channels</p>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    {groupedResults.channels.map((result) => (
                      <article key={result.videoId} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                        <img src={result.thumbnailUrl} alt={result.title} className="h-32 w-full rounded-lg object-cover" />
                        <p className="mt-2 line-clamp-2 text-sm font-semibold">{result.title}</p>
                        <p className="text-xs text-[var(--muted)]">{result.artist}</p>
                        <div className="mt-3 flex items-center gap-2">
                          <button className="rounded-lg border border-[var(--border)] p-2 hover:bg-[var(--hover-bg)]" onClick={() => queueResult(result)} aria-label={t("btn_play", language)}><Play className="h-4 w-4 text-[var(--text)]" /></button>
                          <SearchResultActions resultId={result.videoId} isOpen={openActionsId === result.videoId} onToggle={() => setOpenActionsId((prev) => prev === result.videoId ? null : result.videoId)} onClose={() => setOpenActionsId(null)} onPlayNow={() => queueResult(result)} onAddToQueue={() => queueResult(result)} onAddToFavorites={() => addFavorite({ title: result.title, artist: result.artist, coverUrl: result.thumbnailUrl })} onAddToPlaylist={(playlistId) => addSongToPlaylist(playlistId, { title: result.title, artist: result.artist, coverUrl: result.thumbnailUrl, videoId: result.videoId })} playlists={playlists} onGoToLibrary={() => router.push('/library')} />
                        </div>
                      </article>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-4">
          <SearchInput value={historyQuery} onChange={setHistoryQuery} onClear={() => setHistoryQuery("")} placeholder={t("history_search_placeholder", language)} />
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
