"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock, Play, Search, SearchX, TrendingUp, WifiOff, X } from "../../lucide-react";
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
import { formatArtist } from "../../lib/formatArtist";
import SmartDropdown from "@/src/components/ui/SmartDropdown";

type HistoryItem = {
  id: string;
  song?: { songName?: string; artist?: string };
};

type SearchResult = {
  videoId: string;
  title: string;
  artist: string;
  thumbnailUrl: string;
  isTopicChannel?: boolean;
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
  const { addFavorite, addToHistory } = useUser();
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
  const [history, setHistory] = useState<HistoryItem[]>([]);


  useEffect(() => {
    setHistory(readHistory(profile.id));
  }, [profile.id]);
  useEffect(() => {
    if (!query.trim()) {
      setDebouncedQuery("");
      return;
    }
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 500);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 2) {
      setDiscoverResults([]);
      setIsUnavailable(false);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    fetch(`/api/search?q=${encodeURIComponent(debouncedQuery)}`)
      .then(async (response) => {
        if (response.status === 503) {
          if (!cancelled) {
            setIsUnavailable(true);
            setDiscoverResults([]);
          }
          return;
        }

        if (!response.ok) {
          if (!cancelled) {
            setIsUnavailable(false);
            setDiscoverResults([]);
          }
          return;
        }

        const payload = (await response.json()) as SearchResult[];
        if (cancelled) return;
        setIsUnavailable(false);
        setDiscoverResults(Array.isArray(payload) ? payload.map((item) => ({ ...item, isTopicChannel: item.artist.endsWith("- Topic"), artist: formatArtist(item.artist) })) : []);
        saveQuery(debouncedQuery);
      })
      .catch(() => {
        if (!cancelled) {
          setIsUnavailable(true);
          setDiscoverResults([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
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
    songs: discoverResults.filter((result) => !result.isTopicChannel),
    channels: discoverResults.filter((result) => result.isTopicChannel),
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

  function saveResultToRecent(result: SearchResult) {
    void addToHistory({
      title: result.title,
      artist: result.artist,
      coverUrl: result.thumbnailUrl,
      method: "youtube-search",
      recognized: true,
      createdAt: new Date().toISOString(),
    });
  }

  return (
    <section className="card p-4 sm:p-6">
      <h1 className="cardTitle text-xl font-bold sm:text-2xl">{t("nav_search", language)}</h1>

      <div className="mt-4 app-tabs w-full max-w-full overflow-x-auto sm:w-auto">
        <button type="button" className={`app-tab ${activeTab === "discover" ? "app-tab-active" : ""}`} onClick={() => setActiveTab("discover")}>{t("search_discover", language)}</button>
        <button type="button" className={`app-tab ${activeTab === "history" ? "app-tab-active" : ""}`} onClick={() => setActiveTab("history")}>{t("search_history", language)}</button>
      </div>

      {activeTab === "discover" ? (
        <div className="mt-4 space-y-4">
          <div className="relative">
            <SmartDropdown
              isOpen={isFocused && !query.trim()}
              onOpenChange={setIsFocused}
              placement="bottom-start"
              matchTriggerWidth
              className="w-full rounded-2xl p-2"
              enableClickTrigger={false}
              trigger={(
                <SearchInput
                  value={query}
                  onChange={setQuery}
                  onClear={() => setQuery("")}
                  placeholder={t("search_placeholder", language)}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => window.setTimeout(() => setIsFocused(false), 200)}
                />
              )}
            >
              {recentSearches.length > 0 ? (
                <>
                  <div className="mb-1 flex items-center justify-between px-2 py-1">
                    <p className="inline-flex items-center gap-2 text-sm text-[var(--muted)]"><Clock className="w-4 h-4 text-[var(--muted)]" />{t("search_recent", language)}</p>
                    <button type="button" className="text-xs text-[var(--muted)] hover:text-[var(--text)]" onMouseDown={(event) => event.preventDefault()} onClick={clearRecent}>{t("search_clear_recent", language)}</button>
                  </div>
                  <ul className="space-y-1">
                    {recentSearches.map((item) => (
                      <li key={item} className="dropdown-item flex items-center gap-2 rounded-lg px-2 py-2">
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
                      <button key={item} type="button" className="dropdown-item rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-sm" onMouseDown={(event) => event.preventDefault()} onClick={() => setQuery(item)}>{item}</button>
                    ))}
                  </div>
                </>
              )}
            </SmartDropdown>
          </div>

          {isUnavailable && <p className="cardText inline-flex items-center gap-2"><WifiOff className="w-4 h-4 text-[var(--muted)]" />{t("search_unavailable", language)}</p>}
          {!isUnavailable && (query !== debouncedQuery || isLoading) && <Search className="h-5 w-5 animate-spin text-[var(--muted)]" />}
          {!isUnavailable && !isLoading && query === debouncedQuery && query.trim().length > 0 && discoverResults.length === 0 && (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] py-8 text-center">
              <SearchX className="w-8 h-8 text-[var(--muted)]" />
              <p className="cardText">{t("search_no_results_for", language)} "{debouncedQuery}"</p>
            </div>
          )}

          {discoverResults.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-wider text-[var(--muted)]">{t("songs_heading", language)}</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {groupedResults.songs.map((result) => (
                  <article key={result.videoId} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                    <img src={result.thumbnailUrl} alt={result.title} className="h-32 w-full rounded-lg object-cover" />
                    <p className="mt-2 line-clamp-2 text-sm font-semibold">{result.title}</p>
                    <p className="text-xs text-[var(--muted)]">{result.artist}</p>
                    <div className="mt-3 flex items-center gap-2">
                      <button className="rounded-lg border border-[var(--border)] p-2 hover:bg-[var(--hover-bg)]" onClick={() => queueResult(result)} aria-label={t("btn_play", language)}><Play className="h-4 w-4 text-[var(--text)]" /></button>
                      <SearchResultActions resultId={result.videoId} isOpen={openActionsId === result.videoId} onToggle={() => setOpenActionsId((prev) => prev === result.videoId ? null : result.videoId)} onClose={() => setOpenActionsId(null)} onPlayNow={() => queueResult(result)} onAddToQueue={() => queueResult(result)} onSaveToRecent={() => saveResultToRecent(result)} onAddToFavorites={() => addFavorite({ title: result.title, artist: result.artist, coverUrl: result.thumbnailUrl })} onAddToPlaylist={(playlistId) => addSongToPlaylist(playlistId, { title: result.title, artist: result.artist, coverUrl: result.thumbnailUrl, videoId: result.videoId })} playlists={playlists} onGoToLibrary={() => router.push('/library')} />
                    </div>
                  </article>
                ))}
              </div>

              {groupedResults.channels.length > 0 && (
                <>
                  <hr className="border-[var(--border)]" />
                  <p className="text-xs uppercase tracking-wider text-[var(--muted)]">{t("search_artists_channels", language)}</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {groupedResults.channels.map((result) => (
                      <article key={result.videoId} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                        <img src={result.thumbnailUrl} alt={result.title} className="h-32 w-full rounded-lg object-cover" />
                        <p className="mt-2 line-clamp-2 text-sm font-semibold">{result.title}</p>
                        <p className="text-xs text-[var(--muted)]">{result.artist}</p>
                        <div className="mt-3 flex items-center gap-2">
                          <button className="rounded-lg border border-[var(--border)] p-2 hover:bg-[var(--hover-bg)]" onClick={() => queueResult(result)} aria-label={t("btn_play", language)}><Play className="h-4 w-4 text-[var(--text)]" /></button>
                          <SearchResultActions resultId={result.videoId} isOpen={openActionsId === result.videoId} onToggle={() => setOpenActionsId((prev) => prev === result.videoId ? null : result.videoId)} onClose={() => setOpenActionsId(null)} onPlayNow={() => queueResult(result)} onAddToQueue={() => queueResult(result)} onSaveToRecent={() => saveResultToRecent(result)} onAddToFavorites={() => addFavorite({ title: result.title, artist: result.artist, coverUrl: result.thumbnailUrl })} onAddToPlaylist={(playlistId) => addSongToPlaylist(playlistId, { title: result.title, artist: result.artist, coverUrl: result.thumbnailUrl, videoId: result.videoId })} playlists={playlists} onGoToLibrary={() => router.push('/library')} />
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
