"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  Library,
  Clock,
  Mic,
  Search,
  SearchX,
  TrendingUp,
  Upload,
  WifiOff,
  X,
} from "../../lucide-react";
import SearchInput from "../../components/SearchInput";
import { usePlayer } from "../../components/PlayerProvider";
import { useProfile } from "../../lib/ProfileContext";
import { useLanguage } from "../../lib/LanguageContext";
import { t } from "../../lib/translations";
import { useLibrary } from "../../features/library/useLibrary";
import { useUser } from "../../src/context/UserContext";
import { useRouter } from "next/navigation";
import { useRecentSearches } from "../../lib/useRecentSearches";
import { formatArtist } from "../../lib/formatArtist";
import SmartDropdown from "@/src/components/ui/SmartDropdown";
import SearchResultActions from "../../components/SearchResultActions";
import { runDiscoverSearch } from "../../lib/searchClient";
import SongRow from "../../components/SongRow";
import { toCanonicalSong, toSongKey } from "../../lib/songIdentity";
import type { QueueTrack } from "../../features/player/state";

type HistoryItem = {
  id: string;
  title?: string;
  artist?: string;
  coverUrl?: string;
  youtubeVideoId?: string;
  song?: { songName?: string; artist?: string; albumArtUrl?: string; youtubeVideoId?: string };
  createdAt?: string;
};

type SearchResult = {
  videoId: string;
  title: string;
  artist: string;
  thumbnailUrl: string;
  isTopicChannel?: boolean;
  kind?: "song" | "channel" | "other";
};

export default function SearchPage() {
  const router = useRouter();
  const { language } = useLanguage();
  const { profile } = useProfile();
  const { addToQueue, playNow } = usePlayer();
  const { history: userHistory, saveToLibrary } = useUser();
  const { playlists, addSongToPlaylist, favoritesSet, toggleFavorite } = useLibrary(profile.id);
  const { recentSearches, saveQuery, clearRecent, removeRecent } = useRecentSearches();
  const suggestedQueries = ["Азис", "Глория", "Слави Трифонов", "Преслава", "Sabaton", "Linkin Park", "The Weeknd", "Eminem"];
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [discoverResults, setDiscoverResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUnavailable, setIsUnavailable] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [openActionsId, setOpenActionsId] = useState<string | null>(null);
  const blurTimeoutRef = useRef<number | null>(null);
  const discoverAbortControllerRef = useRef<AbortController | null>(null);
  const latestRequestIdRef = useRef(0);

  useEffect(() => () => {
    if (blurTimeoutRef.current) {
      window.clearTimeout(blurTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncFromLocation = () => {
      const queryFromParams = new URLSearchParams(window.location.search).get("q")?.trim() ?? "";
      setQuery((prev) => (prev === queryFromParams ? prev : queryFromParams));
    };
    syncFromLocation();
    window.addEventListener("popstate", syncFromLocation);
    return () => window.removeEventListener("popstate", syncFromLocation);
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setDebouncedQuery("");
      return;
    }
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 2) {
      latestRequestIdRef.current += 1;
      discoverAbortControllerRef.current?.abort();
      setDiscoverResults([]);
      setIsUnavailable(false);
      setIsLoading(false);
      return;
    }

    const requestId = latestRequestIdRef.current + 1;
    latestRequestIdRef.current = requestId;
    discoverAbortControllerRef.current?.abort();
    const discoverController = new AbortController();
    discoverAbortControllerRef.current = discoverController;
    setIsLoading(true);
    setIsUnavailable(false);

    runDiscoverSearch(debouncedQuery, { signal: discoverController.signal })
      .then((response) => {
        if (latestRequestIdRef.current !== requestId) return;
        setIsUnavailable(response.unavailable);
        const formatted = response.items.map((item) => ({
          ...item,
          isTopicChannel: item.isTopicChannel ?? item.artist.endsWith("- Topic"),
          kind: item.kind,
          artist: formatArtist(item.artist),
        }));
        setDiscoverResults(formatted);
        if (!response.unavailable) {
          saveQuery(debouncedQuery);
        }
      })
      .catch((error: unknown) => {
        if (discoverController.signal.aborted) return;
        if (error instanceof Error && error.name === "AbortError") return;
        if (latestRequestIdRef.current === requestId) {
          setIsUnavailable(true);
          setDiscoverResults([]);
        }
      })
      .finally(() => {
        if (latestRequestIdRef.current === requestId) {
          setIsLoading(false);
        }
      });

    return () => {
      discoverController.abort();
    };
  }, [debouncedQuery, saveQuery]);

  const history = useMemo<HistoryItem[]>(() => {
    return userHistory.map((item) => {
      const song = toCanonicalSong(item);
      return {
        id: item.id,
        title: song.title,
        artist: song.artist,
        coverUrl: song.coverUrl,
        youtubeVideoId: song.videoId,
        createdAt: item.createdAt,
        song: {
          songName: song.title,
          artist: song.artist,
          albumArtUrl: song.coverUrl,
          youtubeVideoId: song.videoId,
        },
      };
    });
  }, [userHistory]);

  const historyResults = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return history;
    return history.filter((item) => {
      const song = item.song?.songName?.toLowerCase() ?? "";
      const artist = item.song?.artist?.toLowerCase() ?? "";
      return song.includes(q) || artist.includes(q);
    });
  }, [history, debouncedQuery]);

  const groupedResults = useMemo(
    () => ({
      songs: discoverResults.filter((result) => (result.kind ?? (result.isTopicChannel ? "channel" : "song")) === "song"),
      channels: discoverResults.filter((result) => (result.kind ?? (result.isTopicChannel ? "channel" : "song")) !== "song"),
    }),
    [discoverResults],
  );

  const recentCaptures = useMemo(() => {
    return history
      .map((item) => ({
        id: item.id,
        title: item.song?.songName ?? item.title,
        artist: item.song?.artist ?? item.artist,
        coverUrl: item.song?.albumArtUrl ?? item.coverUrl,
        youtubeVideoId: item.song?.youtubeVideoId ?? item.youtubeVideoId,
      }))
      .filter((item) => item.title && item.artist)
      .slice(0, 4);
  }, [history]);

  const hasActiveQuery = debouncedQuery.trim().length >= 2;

  function setQueryAndSyncUrl(value: string) {
    setQuery(value);
    const next = value.trim();
    if (!next) {
      router.replace("/search");
      return;
    }
    router.replace(`/search?q=${encodeURIComponent(next)}`);
  }

  function toQueueTrack(result: SearchResult): Omit<QueueTrack, "id"> {
    return {
      title: result.title,
      artist: result.artist,
      artistId: result.videoId,
      artworkUrl: result.thumbnailUrl,
      videoId: result.videoId,
      query: `${result.title} ${result.artist}`,
      license: "COPYRIGHTED",
    };
  }

  function queueResult(result: SearchResult, mode: "play-now" | "add-queue" = "play-now") {
    const track = toQueueTrack(result);
    if (mode === "play-now") {
      playNow(track, "manual");
      return;
    }
    addToQueue(track, "manual");
  }

  return (
    <section className="card p-3 sm:p-6">
      <header className="rounded-2xl border border-[var(--border)] bg-[color:color-mix(in_srgb,var(--surface)_82%,var(--accent)_18%)] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">{language === "bg" ? "ДЪЛБОКО ТЪРСЕНЕ" : "DEEP SEARCH WORKSPACE"}</p>
            <h1 className="cardTitle mt-1 text-xl font-bold sm:text-2xl">{t("nav_search", language)}</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {hasActiveQuery
                ? (language === "bg" ? "Разгледай пълните резултати и действай директно от тях." : "Inspect full results and take actions directly from them.")
                : (language === "bg" ? "Място за по-сериозно търсене и продължаване на откриването." : "A focused place for deeper search and continued discovery.")}
            </p>
          </div>
          {hasActiveQuery ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs text-[var(--muted)]">
              <Search className="h-3.5 w-3.5" />
              {language === "bg" ? `Активна заявка: ${debouncedQuery}` : `Active query: ${debouncedQuery}`}
            </span>
          ) : null}
        </div>

        <div className="mt-4 relative">
          <SmartDropdown
            isOpen={showSearchDropdown && !query.trim()}
            onOpenChange={setShowSearchDropdown}
            placement="bottom-start"
            matchTriggerWidth
            className="w-full rounded-2xl p-2"
            enableClickTrigger={false}
            trigger={(
              <SearchInput
                value={query}
                onChange={setQueryAndSyncUrl}
                onClear={() => setQueryAndSyncUrl("")}
                placeholder={t("search_placeholder", language)}
                className="py-3"
                onFocus={() => {
                  if (blurTimeoutRef.current) window.clearTimeout(blurTimeoutRef.current);
                  setShowSearchDropdown(true);
                }}
                onBlur={() => {
                  blurTimeoutRef.current = window.setTimeout(() => {
                    setShowSearchDropdown(false);
                  }, 200);
                }}
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
                      <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onMouseDown={(event) => event.preventDefault()} onClick={() => setQueryAndSyncUrl(item)}><Clock className="w-4 h-4 text-[var(--muted)]" /><span className="truncate text-sm">{item}</span></button>
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
                    <button key={item} type="button" className="dropdown-item rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-sm" onMouseDown={(event) => event.preventDefault()} onClick={() => setQueryAndSyncUrl(item)}>{item}</button>
                  ))}
                </div>
              </>
            )}
          </SmartDropdown>
        </div>
      </header>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          {isUnavailable && <p className="cardText inline-flex items-center gap-2"><WifiOff className="w-4 h-4 text-[var(--muted)]" />{t("search_unavailable", language)}</p>}
          {!isUnavailable && (query !== debouncedQuery || isLoading) && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--muted)]">
              <span className="inline-flex items-center gap-2"><Search className="h-4 w-4 animate-spin" />{language === "bg" ? "Търсим резултати..." : "Searching for matches..."}</span>
            </div>
          )}

          {!hasActiveQuery && (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center">
              <p className="text-sm text-[var(--muted)]">{language === "bg" ? "Въведи заявка, за да отвориш пълния работен изглед с резултати." : "Type a query to open the full results workspace."}</p>
            </div>
          )}

          {!isUnavailable && !isLoading && hasActiveQuery && discoverResults.length === 0 && (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] py-8 text-center">
              <SearchX className="w-8 h-8 text-[var(--muted)]" />
              <p className="cardText">{t("search_no_results_for", language)} "{debouncedQuery}"</p>
            </div>
          )}

          {hasActiveQuery && discoverResults.length > 0 && (
            <div className="space-y-4">
              <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-xs uppercase tracking-wider text-[var(--muted)]">{t("songs_heading", language)}</p>
                  <p className="text-xs text-[var(--muted)]">{Math.min(groupedResults.songs.length, 10)} / {groupedResults.songs.length}</p>
                </div>
                <div className="space-y-2">
                  {groupedResults.songs.slice(0, 10).map((result) => (
                    <article key={result.videoId} className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-2.5">
                      <img src={result.thumbnailUrl} alt={result.title} className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{result.title}</p>
                        <p className="truncate text-xs text-[var(--muted)]">{result.artist}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <SearchResultActions
                          resultId={result.videoId}
                          isOpen={openActionsId === result.videoId}
                          onOpenChange={(open) => setOpenActionsId(open ? result.videoId : null)}
                          onPlayNow={() => queueResult(result, "play-now")}
                          onAddToQueue={() => queueResult(result, "add-queue")}
                          onSaveToLibrary={() => {
                            void saveToLibrary({
                              title: result.title,
                              artist: result.artist,
                              coverUrl: result.thumbnailUrl,
                              method: "youtube-search",
                              recognized: true,
                            });
                          }}
                          sharePayload={{ title: result.title, artist: result.artist, coverUrl: result.thumbnailUrl }}
                          onAddToPlaylist={(playlistId) =>
                            addSongToPlaylist(playlistId, { title: result.title, artist: result.artist, coverUrl: result.thumbnailUrl, videoId: result.videoId })
                          }
                          playlists={playlists}
                        />
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              {groupedResults.channels.length > 0 && (
                <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-xs uppercase tracking-wider text-[var(--muted)]">{t("search_artists_channels", language)}</p>
                    <p className="text-xs text-[var(--muted)]">{groupedResults.channels.length}</p>
                  </div>
                  <div className="space-y-2">
                    {groupedResults.channels.map((result) => (
                      <article key={result.videoId} className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-2.5">
                        <img src={result.thumbnailUrl} alt={result.title} className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{result.title}</p>
                          <p className="truncate text-xs text-[var(--muted)]">{result.artist}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <SearchResultActions
                            resultId={result.videoId}
                            isOpen={openActionsId === result.videoId}
                            onOpenChange={(open) => setOpenActionsId(open ? result.videoId : null)}
                            onPlayNow={() => queueResult(result, "play-now")}
                            onAddToQueue={() => queueResult(result, "add-queue")}
                            onSaveToLibrary={() => {
                              void saveToLibrary({
                                title: result.title,
                                artist: result.artist,
                                coverUrl: result.thumbnailUrl,
                                method: "youtube-search",
                                recognized: true,
                              });
                            }}
                            sharePayload={{ title: result.title, artist: result.artist, coverUrl: result.thumbnailUrl }}
                            onAddToPlaylist={(playlistId) =>
                              addSongToPlaylist(playlistId, { title: result.title, artist: result.artist, coverUrl: result.thumbnailUrl, videoId: result.videoId })
                            }
                            playlists={playlists}
                          />
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="inline-flex items-center gap-2 text-sm font-semibold"><Library className="h-4 w-4 text-[var(--muted)]" />{language === "bg" ? "Скорошни находки" : "Recent captures"}</p>
            <div className="mt-3 space-y-2">
              {recentCaptures.length === 0 && <p className="text-sm text-[var(--muted)]">{t("history_empty", language)}</p>}
              {recentCaptures.map((item) => {
                const canQueue = Boolean(item.title && item.artist);
                const favoriteKey = toSongKey({ title: item.title, artist: item.artist });
                return (
                  <SongRow
                    key={item.id}
                    id={item.id}
                    title={item.title ?? t("unknown_song", language)}
                    artist={item.artist ?? "-"}
                    artworkUrl={item.coverUrl}
                    videoId={item.youtubeVideoId}
                    onPlay={canQueue ? () => playNow({
                      id: item.id,
                      title: item.title ?? "",
                      artist: item.artist ?? "",
                      artistId: item.id,
                      artworkUrl: item.coverUrl ?? "https://picsum.photos/seed/trackly-search/80",
                      videoId: item.youtubeVideoId,
                      query: `${item.title ?? ""} ${item.artist ?? ""}`,
                      license: "COPYRIGHTED",
                    }, "manual") : undefined}
                    onFavorite={() => toggleFavorite(item.id, item.title, item.artist, item.coverUrl, item.youtubeVideoId)}
                    isFavorite={favoritesSet.has(favoriteKey)}
                    showMoreMenu
                    playlists={playlists}
                    onAddToPlaylist={(playlistId) =>
                      addSongToPlaylist(playlistId, {
                        title: item.title ?? "",
                        artist: item.artist ?? "",
                        coverUrl: item.coverUrl,
                        videoId: item.youtubeVideoId,
                      })
                    }
                  />
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="text-xs uppercase tracking-wider text-[var(--muted)]">{language === "bg" ? "Инструменти за разпознаване" : "Recognition tools"}</p>
            <div className="mt-3 grid grid-cols-1 gap-2">
              <button type="button" onClick={() => router.push("/?intent=recognize-audio")} className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3 text-left transition hover:bg-[var(--hover-bg)]">
                <p className="inline-flex items-center gap-2 text-sm font-medium"><Mic className="h-4 w-4 text-[var(--muted)]" />{language === "bg" ? "Разпознай аудио" : "Recognize audio"}</p>
              </button>
              <button type="button" onClick={() => router.push("/?intent=recognize-ocr")} className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3 text-left transition hover:bg-[var(--hover-bg)]">
                <p className="inline-flex items-center gap-2 text-sm font-medium"><Upload className="h-4 w-4 text-[var(--muted)]" />{language === "bg" ? "Качи screenshot" : "Upload screenshot"}</p>
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="text-xs uppercase tracking-wider text-[var(--muted)]">{language === "bg" ? "Съвпадения в историята" : "Matches in your history"}</p>
            <div className="mt-3 space-y-2">
              {historyResults.slice(0, 5).map((item) => (
                <div key={item.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
                  <p className="truncate text-sm font-medium">{item.song?.songName ?? t("unknown_song", language)}</p>
                  <p className="truncate text-xs text-[var(--muted)]">{item.song?.artist ?? "-"}</p>
                </div>
              ))}
              {historyResults.length === 0 && <p className="text-sm text-[var(--muted)]">{t("history_empty", language)}</p>}
            </div>
            <button type="button" onClick={() => router.push("/library?tab=history")} className="mt-3 inline-flex items-center gap-1 text-xs text-[var(--muted)] hover:text-[var(--text)]">
              {language === "bg" ? "Отвори пълната история" : "Open full history"}
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </section>
        </aside>
      </div>
    </section>
  );
}
