"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  Library,
  Clock,
  Camera,
  Mic,
  Search,
  SearchX,
  Sparkles,
  TrendingUp,
  Upload,
  WifiOff,
  X,
} from "../../lucide-react";
import SearchInput from "../../components/SearchInput";
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
import { runUnifiedSearch } from "../../lib/searchClient";
import SongRow from "../../components/SongRow";
import { normalizeTrackKey } from "../../lib/dedupe";
import { getHomeRecommendations } from "../../features/recommendations/homeRecommendations";
import { readTasteProfile } from "../../src/features/onboarding/tasteProfile";

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
<<<<<<< codex/fix-data-consistency-for-favorites-and-saves
  const { addFavorite, addToHistory, favorites, token, saveToLibrary } = useUser();
  const { playlists, addSongToPlaylist, favoritesSet, toggleFavorite } = useLibrary(profile.id);
=======
  const { addToHistory, favorites, history: userHistory, token } = useUser();
  const { playlists, addSongToPlaylist, favoritesSet, favoritesList, toggleFavorite } = useLibrary(profile.id);
>>>>>>> main
  const { recentSearches, saveQuery, clearRecent, removeRecent } = useRecentSearches();
  const suggestedQueries = ["Азис", "Глория", "Слави Трифонов", "Преслава", "Sabaton", "Linkin Park", "The Weeknd", "Eminem"];
  const [activeTab, setActiveTab] = useState<"discover" | "history">("discover");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [historyQuery, setHistoryQuery] = useState("");
  const [discoverResults, setDiscoverResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUnavailable, setIsUnavailable] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const blurTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    setHistory(readHistory(profile.id));
  }, [profile.id]);

  useEffect(() => () => {
    if (blurTimeoutRef.current) {
      window.clearTimeout(blurTimeoutRef.current);
    }
  }, []);

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
    runUnifiedSearch(debouncedQuery, token)
      .then((response) => {
        if (cancelled) return;
        setIsUnavailable(response.isUnavailable);
        setDiscoverResults(response.discover.map((item) => ({ ...item, isTopicChannel: item.artist.endsWith("- Topic"), artist: formatArtist(item.artist) })));
        if (!response.isUnavailable) {
          saveQuery(debouncedQuery);
        }
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
  }, [debouncedQuery, saveQuery, token]);

  const historyResults = useMemo(() => {
    const q = historyQuery.trim().toLowerCase();
    if (!q) return history;
    return history.filter((item) => {
      const song = item.song?.songName?.toLowerCase() ?? "";
      const artist = item.song?.artist?.toLowerCase() ?? "";
      return song.includes(q) || artist.includes(q);
    });
  }, [history, historyQuery]);

  const groupedResults = useMemo(
    () => ({
      songs: discoverResults.filter((result) => !result.isTopicChannel),
      channels: discoverResults.filter((result) => result.isTopicChannel),
    }),
    [discoverResults],
  );
  const tasteProfile = useMemo(() => readTasteProfile(), []);
  const recommendationHistory = useMemo(
    () =>
      history.filter(
        (item): item is { id: string; song: { songName: string; artist: string; albumArtUrl?: string; youtubeVideoId?: string } } =>
          Boolean(item.song?.songName && item.song?.artist),
      ),
    [history],
  );
  const homeBrowse = useMemo(
    () =>
      getHomeRecommendations({
        language,
        userId: profile.id,
        history: recommendationHistory,
        favorites: favorites.map((favorite) => ({
          key: normalizeTrackKey(favorite.title, favorite.artist),
          title: favorite.title,
          artist: favorite.artist,
          artworkUrl: favorite.coverUrl ?? undefined,
        })),
        tasteProfile,
        limit: 8,
      }),
    [favorites, recommendationHistory, language, profile.id, tasteProfile],
  );
  const recentCaptures = useMemo(() => {
    const mapped = userHistory
      .filter((item) => item.title && item.artist)
      .map((item) => ({
        id: item.id,
        title: item.title,
        artist: item.artist,
        coverUrl: item.coverUrl ?? undefined,
        youtubeVideoId: undefined,
      }));

    if (mapped.length > 0) return mapped.slice(0, 4);

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
  }, [history, userHistory]);

  const hasActiveQuery = debouncedQuery.trim().length >= 2;

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
    <section className="card p-3 sm:p-6">
      <header className="rounded-2xl border border-[var(--border)] bg-[color:color-mix(in_srgb,var(--surface)_88%,var(--accent)_12%)] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="cardTitle text-xl font-bold sm:text-2xl">{t("nav_search", language)}</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {hasActiveQuery
                ? (language === "bg" ? "Резултати за текущата заявка" : "Results for your current query")
                : (language === "bg" ? "Откривай, улавяй и запазвай музика по-бързо" : "Discover, capture, and save music faster")}
            </p>
          </div>
          {hasActiveQuery ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs text-[var(--muted)]">
              <Search className="h-3.5 w-3.5" />
              {language === "bg" ? `Търсене: ${debouncedQuery}` : `Searching: ${debouncedQuery}`}
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
                onChange={setQuery}
                onClear={() => setQuery("")}
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

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <button type="button" onClick={() => setQuery("")} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-left transition hover:bg-[var(--hover-bg)]">
            <Search className="mb-1.5 h-4 w-4 text-[var(--muted)]" />
            <p className="text-sm font-medium">{language === "bg" ? "Търси песни" : "Search songs"}</p>
          </button>
          <button type="button" onClick={() => router.push("/?intent=recognize-audio")} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-left transition hover:bg-[var(--hover-bg)]">
            <Mic className="mb-1.5 h-4 w-4 text-[var(--muted)]" />
            <p className="text-sm font-medium">{language === "bg" ? "Разпознай аудио" : "Recognize audio"}</p>
          </button>
          <button type="button" onClick={() => router.push("/?intent=recognize-ocr")} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-left transition hover:bg-[var(--hover-bg)]">
            <Upload className="mb-1.5 h-4 w-4 text-[var(--muted)]" />
            <p className="text-sm font-medium">{language === "bg" ? "Качи screenshot" : "Upload screenshot"}</p>
          </button>
          <button type="button" onClick={() => router.push("/assistant")} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-left transition hover:bg-[var(--hover-bg)]">
            <Sparkles className="mb-1.5 h-4 w-4 text-[var(--muted)]" />
            <p className="text-sm font-medium">{language === "bg" ? "Отвори асистент" : "Open assistant"}</p>
          </button>
        </div>
      </header>

      <div className="mt-4 app-tabs w-full max-w-full overflow-x-auto sm:w-auto">
        <button type="button" className={`app-tab ${activeTab === "discover" ? "app-tab-active" : ""}`} onClick={() => setActiveTab("discover")}>{t("search_discover", language)}</button>
        <button type="button" className={`app-tab ${activeTab === "history" ? "app-tab-active" : ""}`} onClick={() => setActiveTab("history")}>{t("search_history", language)}</button>
      </div>

      {activeTab === "discover" ? (
        <div className="mt-4 space-y-4">
          {isUnavailable && <p className="cardText inline-flex items-center gap-2"><WifiOff className="w-4 h-4 text-[var(--muted)]" />{t("search_unavailable", language)}</p>}
          {!isUnavailable && (query !== debouncedQuery || isLoading) && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--muted)]">
              <span className="inline-flex items-center gap-2"><Search className="h-4 w-4 animate-spin" />{language === "bg" ? "Търсим резултати..." : "Searching for matches..."}</span>
            </div>
          )}

          {!hasActiveQuery && (
            <div className="space-y-4">
              {recentSearches.length > 0 && (
                <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="inline-flex items-center gap-2 text-sm font-semibold"><Clock className="h-4 w-4 text-[var(--muted)]" />{t("search_recent", language)}</p>
                    <button type="button" onClick={clearRecent} className="text-xs text-[var(--muted)] hover:text-[var(--text)]">{t("search_clear_recent", language)}</button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {recentSearches.slice(0, 8).map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setQuery(item)}
                        className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-sm transition hover:bg-[var(--hover-bg)]"
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {recentCaptures.length > 0 && (
                <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="inline-flex items-center gap-2 text-sm font-semibold"><Library className="h-4 w-4 text-[var(--muted)]" />{language === "bg" ? "Скорошни находки" : "Recent captures"}</p>
                    <button type="button" onClick={() => setActiveTab("history")} className="inline-flex items-center gap-1 text-xs text-[var(--muted)] hover:text-[var(--text)]">
                      {language === "bg" ? "Виж история" : "View history"}
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="space-y-2">
                    {recentCaptures.map((item) => {
                      const canQueue = Boolean(item.title && item.artist);
                      const favoriteKey = normalizeTrackKey(item.title ?? "", item.artist ?? "");
                      return (
                        <SongRow
                          key={item.id}
                          id={item.id}
                          title={item.title ?? t("unknown_song", language)}
                          artist={item.artist ?? "-"}
                          artworkUrl={item.coverUrl}
                          videoId={item.youtubeVideoId}
                          onPlay={canQueue ? () => addToQueue({
                            id: item.id,
                            title: item.title ?? "",
                            artist: item.artist ?? "",
                            artistId: item.id,
                            artworkUrl: item.coverUrl ?? "https://picsum.photos/seed/trackly-search/80",
                            videoId: item.youtubeVideoId,
                            query: `${item.title ?? ""} ${item.artist ?? ""}`,
                            license: "COPYRIGHTED",
                          }) : undefined}
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
              )}

              {favoritesList.length > 0 && (
                <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="inline-flex items-center gap-2 text-sm font-semibold"><Library className="h-4 w-4 text-[var(--muted)]" />{language === "bg" ? "Любими песни" : "Favorite songs"}</p>
                    <button type="button" onClick={() => router.push("/library?tab=favorites")} className="inline-flex items-center gap-1 text-xs text-[var(--muted)] hover:text-[var(--text)]">
                      {language === "bg" ? "Към любими" : "Open favorites"}
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="space-y-2">
                    {favoritesList.slice(0, 4).map((favorite) => {
                      const [title, artist] = [favorite.title, favorite.artist];
                      const id = favorite.key;
                      return (
                        <SongRow
                          key={id}
                          id={id}
                          title={title}
                          artist={artist}
                          artworkUrl={favorite.artworkUrl}
                          onPlay={() =>
                            addToQueue({
                              id,
                              title,
                              artist,
                              artistId: `artist-${artist}`.toLowerCase().replace(/\s+/g, "-"),
                              artworkUrl: favorite.artworkUrl ?? "https://picsum.photos/seed/trackly-search-favorite/80",
                              query: `${title} ${artist}`,
                              license: "COPYRIGHTED",
                            })
                          }
                          onFavorite={() => toggleFavorite(id, title, artist, favorite.artworkUrl)}
                          isFavorite={favoritesSet.has(favorite.key)}
                          showMoreMenu
                          playlists={playlists}
                          onAddToPlaylist={(playlistId) =>
                            addSongToPlaylist(playlistId, {
                              title,
                              artist,
                              coverUrl: favorite.artworkUrl,
                            })
                          }
                        />
                      );
                    })}
                  </div>
                </section>
              )}

              <section className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <div>
                  <p className="inline-flex items-center gap-2 text-xs uppercase tracking-wider text-[var(--muted)]"><Camera className="h-3.5 w-3.5" />{t("search_from_home", language)}</p>
                  <h2 className="mt-1 text-lg font-semibold">{homeBrowse.title}</h2>
                  <p className="text-sm text-[var(--muted)]">{homeBrowse.description}</p>
                </div>
                <div className="space-y-2">
                  {homeBrowse.tracks.slice(0, 5).map((track) => {
                    const favoriteKey = normalizeTrackKey(track.title, track.artistName);
                    return (
                      <SongRow
                        key={track.id}
                        id={track.id}
                        title={track.title}
                        artist={track.artistName}
                        artworkUrl={track.artworkUrl}
                        videoId={track.youtubeVideoId}
                        onPlay={() =>
                          addToQueue({
                            id: track.id,
                            title: track.title,
                            artist: track.artistName,
                            artistId: track.artistId,
                            artworkUrl: track.artworkUrl,
                            videoId: track.youtubeVideoId,
                            query: `${track.title} ${track.artistName}`,
                            license: track.license,
                          })
                        }
                        onFavorite={() => toggleFavorite(track.id, track.title, track.artistName, track.artworkUrl, track.youtubeVideoId)}
                        isFavorite={favoritesSet.has(favoriteKey)}
                        showMoreMenu
                        playlists={playlists}
                        onAddToPlaylist={(playlistId) =>
                          addSongToPlaylist(playlistId, {
                            title: track.title,
                            artist: track.artistName,
                            coverUrl: track.artworkUrl,
                            videoId: track.youtubeVideoId,
                          })
                        }
                      />
                    );
                  })}
                </div>
              </section>
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
                  <p className="text-xs text-[var(--muted)]">{groupedResults.songs.length}</p>
                </div>
                <div className="space-y-2">
                  {groupedResults.songs.map((result) => (
<<<<<<< codex/fix-data-consistency-for-favorites-and-saves
                    <article key={result.videoId} className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-2.5">
                      <img src={result.thumbnailUrl} alt={result.title} className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{result.title}</p>
                        <p className="truncate text-xs text-[var(--muted)]">{result.artist}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button className="rounded-lg border border-[var(--border)] p-2 hover:bg-[var(--hover-bg)]" onClick={() => queueResult(result)} aria-label={t("btn_play", language)}><Play className="h-4 w-4 text-[var(--text)]" /></button>
                        <SearchResultActions
                          resultId={result.videoId}
                          isOpen={openActionsId === result.videoId}
                          onToggle={() => setOpenActionsId((prev) => (prev === result.videoId ? null : result.videoId))}
                          onClose={() => setOpenActionsId(null)}
                          onPlayNow={() => queueResult(result)}
                          onAddToQueue={() => queueResult(result)}
                          onSaveToRecent={() => saveResultToRecent(result)}
                          onSaveToLibrary={() => {
                            void saveToLibrary({
                              title: result.title,
                              artist: result.artist,
                              coverUrl: result.thumbnailUrl,
                              method: "youtube-search",
                              recognized: true,
                            });
                          }}
                          onAddToFavorites={() => addFavorite({ title: result.title, artist: result.artist, coverUrl: result.thumbnailUrl })}
                          onAddToPlaylist={(playlistId) =>
                            addSongToPlaylist(playlistId, { title: result.title, artist: result.artist, coverUrl: result.thumbnailUrl, videoId: result.videoId })
                          }
                          playlists={playlists}
                          onGoToLibrary={() => router.push("/library")}
                        />
                      </div>
                    </article>
=======
                    <SongRow
                      key={result.videoId}
                      id={result.videoId}
                      title={result.title}
                      artist={result.artist}
                      artworkUrl={result.thumbnailUrl}
                      videoId={result.videoId}
                      onPlay={() => queueResult(result)}
                      onFavorite={() => {
                        saveResultToRecent(result);
                        toggleFavorite(result.videoId, result.title, result.artist, result.thumbnailUrl, result.videoId);
                      }}
                      isFavorite={favoritesSet.has(normalizeTrackKey(result.title, result.artist))}
                      showMoreMenu
                      playlists={playlists}
                      onAddToPlaylist={(playlistId) =>
                        addSongToPlaylist(playlistId, { title: result.title, artist: result.artist, coverUrl: result.thumbnailUrl, videoId: result.videoId })
                      }
                    />
>>>>>>> main
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
<<<<<<< codex/fix-data-consistency-for-favorites-and-saves
                      <article key={result.videoId} className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-2.5">
                        <img src={result.thumbnailUrl} alt={result.title} className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{result.title}</p>
                          <p className="truncate text-xs text-[var(--muted)]">{result.artist}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <button className="rounded-lg border border-[var(--border)] p-2 hover:bg-[var(--hover-bg)]" onClick={() => queueResult(result)} aria-label={t("btn_play", language)}><Play className="h-4 w-4 text-[var(--text)]" /></button>
                          <SearchResultActions
                            resultId={result.videoId}
                            isOpen={openActionsId === result.videoId}
                            onToggle={() => setOpenActionsId((prev) => (prev === result.videoId ? null : result.videoId))}
                            onClose={() => setOpenActionsId(null)}
                            onPlayNow={() => queueResult(result)}
                            onAddToQueue={() => queueResult(result)}
                            onSaveToRecent={() => saveResultToRecent(result)}
                            onSaveToLibrary={() => {
                              void saveToLibrary({
                                title: result.title,
                                artist: result.artist,
                                coverUrl: result.thumbnailUrl,
                                method: "youtube-search",
                                recognized: true,
                              });
                            }}
                            onAddToFavorites={() => addFavorite({ title: result.title, artist: result.artist, coverUrl: result.thumbnailUrl })}
                            onAddToPlaylist={(playlistId) =>
                              addSongToPlaylist(playlistId, { title: result.title, artist: result.artist, coverUrl: result.thumbnailUrl, videoId: result.videoId })
                            }
                            playlists={playlists}
                            onGoToLibrary={() => router.push("/library")}
                          />
                        </div>
                      </article>
=======
                      <SongRow
                        key={result.videoId}
                        id={result.videoId}
                        title={result.title}
                        artist={result.artist}
                        artworkUrl={result.thumbnailUrl}
                        videoId={result.videoId}
                        onPlay={() => queueResult(result)}
                        onFavorite={() => {
                          saveResultToRecent(result);
                          toggleFavorite(result.videoId, result.title, result.artist, result.thumbnailUrl, result.videoId);
                        }}
                        isFavorite={favoritesSet.has(normalizeTrackKey(result.title, result.artist))}
                        showMoreMenu
                        playlists={playlists}
                        onAddToPlaylist={(playlistId) =>
                          addSongToPlaylist(playlistId, { title: result.title, artist: result.artist, coverUrl: result.thumbnailUrl, videoId: result.videoId })
                        }
                      />
>>>>>>> main
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <SearchInput value={historyQuery} onChange={setHistoryQuery} onClear={() => setHistoryQuery("")} placeholder={t("history_search_placeholder", language)} />
          <div className="mt-4 space-y-2">
            {historyResults.length === 0 && <p className="cardText">{t("history_empty", language)}</p>}
            {historyResults.map((item) => (
              <div key={item.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
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
