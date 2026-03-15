"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BarChart2, ChevronDown, ChevronLeft, ChevronRight, Clock, Headphones, Heart, HelpCircle, Info, Library, LogOut, Music, Play, Search, Settings, TrendingUp, User, WifiOff, X } from "../lucide-react";
import BottomPlayBar from "./BottomPlayBar";
import { PlayerProvider } from "./PlayerProvider";
import type { Playlist } from "../features/library/types";
import { scopedKey, useProfile } from "../lib/ProfileContext";
import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/translations";
import { useUser } from "../src/context/UserContext";
import { usePlayer } from "./PlayerProvider";
import SearchInput from "./SearchInput";
import SearchResultActions from "./SearchResultActions";
import { useLibrary } from "../features/library/useLibrary";
import { useRecentSearches } from "../lib/useRecentSearches";

type HistoryItem = {
  id: string;
  createdAt?: string;
  song?: { songName?: string; artist?: string };
};

type LibrarySnapshot = {
  favorites: string[];
  playlists: Playlist[];
};

type SearchResult = {
  videoId: string;
  title: string;
  artist: string;
  thumbnailUrl: string;
};

const PRIMARY_NAV = [
  { href: "/", key: "nav_listen", icon: Headphones },
  { href: "/library", key: "nav_library", icon: Library },
  { href: "/search", key: "nav_search", icon: Search },
  { href: "/profile", key: "nav_profile", icon: User },
  { href: "/settings", key: "nav_settings", icon: Settings },
] as const;

const SECONDARY_NAV = [
  { href: "/about", key: "nav_about", icon: Info },
  { href: "/how-to-use", key: "nav_how_to_use", icon: HelpCircle },
  { href: "/concept", key: "nav_concept", icon: Info },
  { href: "/idea", key: "nav_idea", icon: Info },
  { href: "/founders", key: "nav_founders", icon: User },
  { href: "/the-future", key: "nav_the_future", icon: Info },
  { href: "/stats", key: "nav_stats", icon: BarChart2 },
] as const;

function AppShellContent({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { language } = useLanguage();
  const { profile } = useProfile();
  const { user, isAuthenticated, logout, addFavorite } = useUser();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [recentHistory, setRecentHistory] = useState<HistoryItem[]>([]);
  const [librarySnapshot, setLibrarySnapshot] = useState<LibrarySnapshot>({ favorites: [], playlists: [] });
  const [showUserMenu, setShowUserMenu] = useState(false);
  const { addToQueue, currentTrack } = usePlayer();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [isSearchUnavailable, setIsSearchUnavailable] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [openActionsId, setOpenActionsId] = useState<string | null>(null);
  const blurTimeoutRef = useRef<number | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const { playlists, addSongToPlaylist } = useLibrary(profile.id);
  const { recentSearches, saveQuery, clearRecent, removeRecent } = useRecentSearches();
  const suggestedQueries = ["Азис", "Глория", "Слави Трифонов", "Преслава", "Sabaton", "Linkin Park", "The Weeknd", "Eminem"];

  useEffect(() => {
    
    function syncSidebarData() {
      try {
        const historyRaw = window.localStorage.getItem(scopedKey("ponotai-history", profile.id));
        const libraryRaw = window.localStorage.getItem(scopedKey("ponotai.library.playlists", profile.id));
        const favoritesRaw = window.localStorage.getItem(scopedKey("ponotai.library.favorites", profile.id));
        const history = historyRaw ? (JSON.parse(historyRaw) as HistoryItem[]) : [];
        const playlists = libraryRaw ? (JSON.parse(libraryRaw) as Playlist[]) : [];
        const favorites = favoritesRaw ? (JSON.parse(favoritesRaw) as string[]) : [];
        setRecentHistory(history.slice(0, 5));
        setLibrarySnapshot({ favorites, playlists });
      } catch {
        setRecentHistory([]);
        setLibrarySnapshot({ favorites: [], playlists: [] });
      }
    }

    syncSidebarData();
    window.addEventListener("storage", syncSidebarData);
    return () => window.removeEventListener("storage", syncSidebarData);
  }, [pathname, profile.id]);

  const recognizedToday = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return recentHistory.filter((item) => item.createdAt?.startsWith(today)).length;
  }, [recentHistory]);

  function executeSearchQuery(value: string) {
    setQuery(value);
  }

  async function handleLogout() {
    await logout();
    setShowUserMenu(false);
    router.push("/");
  }

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
      setSearchResults([]);
      setIsSearching(false);
      setIsSearchUnavailable(false);
      setHighlightedIndex(-1);
      return;
    }
    let cancelled = false;
    setIsSearching(true);
    fetch(`/api/search?q=${encodeURIComponent(debouncedQuery)}`)
      .then(async (response) => {
        if (response.status === 503) {
          if (!cancelled) {
            setIsSearchUnavailable(true);
            setSearchResults([]);
            setHighlightedIndex(-1);
          }
          return;
        }

        if (!response.ok) {
          if (!cancelled) {
            setIsSearchUnavailable(false);
            setSearchResults([]);
            setHighlightedIndex(-1);
          }
          return;
        }

        const payload = (await response.json()) as SearchResult[];
        if (cancelled) return;
        setIsSearchUnavailable(false);
        const nextResults = Array.isArray(payload) ? payload.slice(0, 8) : [];
        saveQuery(debouncedQuery);
        setSearchResults(nextResults);
        setHighlightedIndex(nextResults.length > 0 ? 0 : -1);
      })
      .catch(() => {
        if (!cancelled) {
          setIsSearchUnavailable(true);
          setSearchResults([]);
          setHighlightedIndex(-1);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsSearching(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, saveQuery]);

  function queueTrack(result: SearchResult, closeDropdown = true) {
    addToQueue({
      title: result.title,
      artist: result.artist,
      artistId: result.videoId,
      artworkUrl: result.thumbnailUrl,
      videoId: result.videoId,
      query: `${result.title} ${result.artist}`,
      license: "COPYRIGHTED",
    });
    if (closeDropdown) setShowSearchDropdown(false);
  }

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setShowSearchDropdown(false);
      setHighlightedIndex(-1);
      return;
    }

    if (!showSearchDropdown || searchResults.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % searchResults.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((prev) => (prev <= 0 ? searchResults.length - 1 : prev - 1));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const target = highlightedIndex >= 0 ? searchResults[highlightedIndex] : searchResults[0];
      if (target) queueTrack(target);
    }
  }

  useEffect(() => {
    function onWindowKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName.toLowerCase();
      if (event.key !== "/") return;
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      event.preventDefault();
      searchInputRef.current?.focus();
    }

    window.addEventListener("keydown", onWindowKeyDown);
    return () => window.removeEventListener("keydown", onWindowKeyDown);
  }, []);

  const groupedSearchResults = useMemo(() => {
    const songs = searchResults.filter((result) => !result.artist.endsWith("- Topic"));
    const channels = searchResults.filter((result) => result.artist.endsWith("- Topic"));
    return { songs, channels };
  }, [searchResults]);

  // Avatar initials
  const initials = (user?.username ?? "G")
    .split(" ")
    .map((c) => c[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <>
      <div className="flex min-h-screen">
        {/* Sidebar */}
        <aside
          className={`hidden p-4 backdrop-blur-xl transition-all md:block ${isCollapsed ? "w-20" : "w-72"}`}
          style={{ background: "var(--sidebar-bg)", borderRight: "1px solid var(--border)" }}
        >
          {/* Logo */}
          <div className="mb-8 mt-2 flex items-center justify-between">
            <Link href="/" className="block select-none">
              <h1 className="logoWrapper flex items-center gap-2">
                <span className="logoDot" />
                {!isCollapsed && (
                  <span className="logoText">{language === "bg" ? "ПонотИИ" : "PonotAI"}</span>
                )}
              </h1>
            </Link>
            <button
              className="navItem !p-2 text-sm"
              onClick={() => setIsCollapsed((prev) => !prev)}
              aria-label={language === "bg" ? "Свий страничното меню" : "Collapse sidebar"}
            >
              {isCollapsed ? <ChevronRight className="w-4 h-4 text-[var(--muted)]" /> : <ChevronLeft className="w-4 h-4 text-[var(--muted)]" />}
            </button>
          </div>

          {/* User section */}
          {!isCollapsed && (
            <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs">
              {isAuthenticated && user ? (
                <div className="relative">
                  <button
                    className="flex w-full items-center gap-2 text-left"
                    onClick={() => setShowUserMenu((v) => !v)}
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-bold text-white">
                      {initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-[var(--text)]">{user.username}</p>
                      <p className="truncate text-[var(--muted)]">{user.email}</p>
                    </div>
                    <ChevronDown className="w-4 h-4 text-[var(--muted)]" />
                  </button>

                  {showUserMenu && (
                    <div className="absolute left-0 right-0 top-10 z-20 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-2 text-[var(--text)] shadow-2xl [backdrop-filter:none]">
                      <Link
                        href="/profile"
                        className="block rounded-lg px-3 py-2 text-sm hover:bg-[var(--hover-bg)]"
                        onClick={() => setShowUserMenu(false)}
                      >
                        <span className="inline-flex items-center gap-2"><User className="w-4 h-4 text-[var(--muted)]" />{language === "bg" ? "Профил" : "Profile"}</span>
                      </Link>
                      <Link
                        href="/settings"
                        className="block rounded-lg px-3 py-2 text-sm hover:bg-[var(--hover-bg)]"
                        onClick={() => setShowUserMenu(false)}
                      >
                        <span className="inline-flex items-center gap-2"><Settings className="w-4 h-4 text-[var(--muted)]" />{language === "bg" ? "Настройки" : "Settings"}</span>
                      </Link>
                      <button
                        className="w-full rounded-lg px-3 py-2 text-left text-sm text-red-400 hover:bg-[var(--hover-bg)]"
                        onClick={handleLogout}
                      >
                        <span className="inline-flex items-center gap-2"><LogOut className="w-4 h-4 text-[var(--muted)]" />{language === "bg" ? "Изход" : "Sign out"}</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="text-[var(--muted)]">
                    {language === "bg" ? "Не си влязъл" : "Not signed in"}
                  </p>
                  <div className="flex gap-2">
                    <Link
                      href="/auth"
                      className="flex-1 rounded-lg border border-[var(--accent)] bg-[var(--active-bg)] px-2 py-1.5 text-center text-xs font-semibold text-[var(--text)] hover:bg-[var(--accent)]/30"
                    >
                      {language === "bg" ? "Влез" : "Sign in"}
                    </Link>
                    <Link
                      href="/auth?tab=signup"
                      className="flex-1 rounded-lg border border-[var(--border)] px-2 py-1.5 text-center text-xs hover:bg-[var(--hover-bg)]"
                    >
                      {language === "bg" ? "Регистрация" : "Sign up"}
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Collapsed user avatar */}
          {isCollapsed && (
            <div className="mb-4 flex justify-center">
              {isAuthenticated ? (
                <Link href="/profile">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-bold text-white">
                    {initials}
                  </div>
                </Link>
              ) : (
                <Link href="/auth">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-base">
                    <User className="w-4 h-4 text-[var(--muted)]" />
                  </div>
                </Link>
              )}
            </div>
          )}

          {/* Primary nav */}
          <nav className="flex flex-col gap-2 text-base">
            {PRIMARY_NAV.map((item) => (
              <Link
                key={item.href}
                className={pathname === item.href ? "navItemActive" : "navItem"}
                href={item.href}
              >
                <item.icon className="w-4 h-4 text-[var(--muted)]" />
                {!isCollapsed && <span>{t(item.key, language)}</span>}
              </Link>
            ))}
          </nav>

          {/* Recent history panel */}
          {!isCollapsed && pathname === "/" && (
            <div className="mt-6 space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs">
              <h3 className="text-sm font-semibold text-[var(--text)]">
                {t("sidebar_recent_history", language)}
              </h3>
              <ul className="space-y-1 text-[var(--muted)]">
                {recentHistory.length === 0 && <li>{t("history_empty", language)}</li>}
                {recentHistory.map((item) => (
                  <li key={item.id} className="truncate">
                    • {item.song?.songName ?? "-"} — {item.song?.artist ?? "-"}
                  </li>
                ))}
              </ul>
              <div className="rounded-lg border border-[var(--border)] bg-[var(--input-bg)] p-2 text-[var(--muted)]">
                <div>{t("sidebar_total_recognized", language)}: {recentHistory.length}</div>
                <div>{t("sidebar_today_count", language)}: {recognizedToday}</div>
                <div>{t("library_favorites", language)}: {librarySnapshot.favorites.length}</div>
              </div>
            </div>
          )}

          {!isCollapsed && pathname === "/library" && (
            <div className="mt-6 space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs text-[var(--muted)]">
              <h3 className="text-sm font-semibold text-[var(--text)]">{t("library_playlists", language)}</h3>
              {librarySnapshot.playlists.map((playlist) => (
                <p key={playlist.id}>• {playlist.name} ({playlist.songs.length})</p>
              ))}
              {librarySnapshot.playlists.length === 0 && <p>{t("no_playlists_created", language)}</p>}
            </div>
          )}

          {/* Secondary nav */}
          <div className="mt-6 border-t border-[var(--border)] pt-4">
            <nav className="flex flex-col gap-2 text-sm">
              {SECONDARY_NAV.map((item) => (
                <Link
                  key={item.href}
                  className={pathname === item.href ? "navItemActive" : "navItem"}
                  href={item.href}
                >
                  <item.icon className="w-4 h-4 text-[var(--muted)]" />
                  {!isCollapsed && <span>{t(item.key, language)}</span>}
                </Link>
              ))}
            </nav>
          </div>
        </aside>

        <main className="flex-1 px-4 pb-[13rem] pt-6 sm:px-8 sm:pb-36 sm:pt-8">
          <div className="mb-4 hidden items-center gap-2 md:flex">
            <div className="relative flex-1 pointer-events-none">
              <div className="pointer-events-auto">
                <SearchInput
                  inputRef={searchInputRef}
                  value={query}
                  onChange={(value) => executeSearchQuery(value)}
                  onClear={() => {
                    setQuery("");
                    setSearchResults([]);
                    setIsSearchUnavailable(false);
                  }}
                  placeholder={t("search_placeholder", language)}
                  onFocus={() => {
                    if (blurTimeoutRef.current) window.clearTimeout(blurTimeoutRef.current);
                    setShowSearchDropdown(true);
                  }}
                  onBlur={() => {
                    blurTimeoutRef.current = window.setTimeout(() => {
                      setShowSearchDropdown(false);
                      setOpenActionsId(null);
                    }, 200);
                  }}
                  onKeyDown={handleSearchKeyDown}
                />
              </div>

              {showSearchDropdown && (
                <div className="pointer-events-auto absolute z-[9999] mt-2 w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-2 shadow-2xl">
                  {!query.trim() ? (
                    recentSearches.length > 0 ? (
                      <div>
                        <div className="mb-1 flex items-center justify-between px-2 py-1">
                          <p className="inline-flex items-center gap-2 text-sm text-[var(--muted)]"><Clock className="w-4 h-4 text-[var(--muted)]" />{t("search_recent", language)}</p>
                          <button type="button" className="text-xs text-[var(--muted)] hover:text-[var(--text)]" onMouseDown={(event) => event.preventDefault()} onClick={clearRecent}>{t("search_clear_recent", language)}</button>
                        </div>
                        <ul className="space-y-1">
                          {recentSearches.map((item) => (
                            <li key={item} className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-[var(--hover-bg)]">
                              <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onMouseDown={(event) => event.preventDefault()} onClick={() => executeSearchQuery(item)}>
                                <Clock className="w-4 h-4 text-[var(--muted)]" />
                                <span className="truncate text-sm">{item}</span>
                              </button>
                              <button type="button" className="rounded-full p-1 hover:bg-[var(--hover-bg)]" onMouseDown={(event) => event.preventDefault()} onClick={() => removeRecent(item)}><X className="w-3 h-3 text-[var(--muted)]" /></button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <div>
                        <p className="mb-2 inline-flex items-center gap-2 px-2 text-sm text-[var(--muted)]"><TrendingUp className="w-4 h-4 text-[var(--muted)]" />{t("search_suggested", language)}</p>
                        <div className="flex flex-wrap gap-2 px-2 pb-1">
                          {suggestedQueries.map((item) => (
                            <button key={item} type="button" className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-sm hover:bg-[var(--hover-bg)]" onMouseDown={(event) => event.preventDefault()} onClick={() => executeSearchQuery(item)}>{item}</button>
                          ))}
                        </div>
                      </div>
                    )
                  ) : (query !== debouncedQuery || isSearching) ? (
                    <div className="flex items-center justify-center py-3 text-[var(--muted)]">
                      <Search className="h-4 w-4 animate-spin" />
                    </div>
                  ) : isSearchUnavailable ? (
                    <p className="flex items-center gap-2 px-3 py-2 text-sm text-[var(--muted)]">
                      <WifiOff className="w-4 h-4 text-[var(--muted)]" />
                      {t("search_unavailable", language)}
                    </p>
                  ) : query === debouncedQuery && searchResults.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-[var(--muted)]">{t("search_no_results", language)}</p>
                  ) : (
                    <div className="space-y-2">
                      <p className="px-2 text-xs uppercase tracking-wider text-[var(--muted)]">Songs</p>
                      <ul className="space-y-1">
                        {groupedSearchResults.songs.map((result, index) => (
                          <li key={result.videoId} className={`flex items-center gap-3 rounded-xl px-2 py-2 ${highlightedIndex === index ? "bg-[var(--hover-bg)]" : ""}`}>
                            <img src={result.thumbnailUrl} alt={result.title} className="h-10 w-10 rounded-md object-cover" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-[var(--text)]">{result.title}</p>
                              <p className="truncate text-xs text-[var(--muted)]">{result.artist}</p>
                            </div>
                            <button type="button" className="rounded-full border border-[var(--border)] p-2 hover:bg-[var(--hover-bg)]" onMouseDown={(event) => event.preventDefault()} onClick={() => queueTrack(result)} aria-label={t("btn_play", language)}>
                              <Play className="h-4 w-4 text-[var(--text)]" />
                            </button>
                            <SearchResultActions
                              resultId={result.videoId}
                              isOpen={openActionsId === result.videoId}
                              onToggle={() => setOpenActionsId((prev) => (prev === result.videoId ? null : result.videoId))}
                              onClose={() => setOpenActionsId(null)}
                              onPlayNow={() => queueTrack(result)}
                              onAddToQueue={() => queueTrack(result, false)}
                              onAddToFavorites={() => addFavorite({ title: result.title, artist: result.artist, coverUrl: result.thumbnailUrl })}
                              onAddToPlaylist={(playlistId) => addSongToPlaylist(playlistId, { title: result.title, artist: result.artist, coverUrl: result.thumbnailUrl, videoId: result.videoId })}
                              playlists={playlists}
                              onGoToLibrary={() => router.push('/library')}
                            />
                          </li>
                        ))}
                      </ul>
                      {groupedSearchResults.channels.length > 0 && (
                        <>
                          <hr className="border-[var(--border)]" />
                          <p className="px-2 text-xs uppercase tracking-wider text-[var(--muted)]">Artists & Channels</p>
                          <ul className="space-y-1">
                            {groupedSearchResults.channels.map((result) => (
                              <li key={result.videoId} className="flex items-center gap-3 rounded-xl px-2 py-2">
                                <img src={result.thumbnailUrl} alt={result.title} className="h-10 w-10 rounded-md object-cover" />
                                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-[var(--text)]">{result.title}</p><p className="truncate text-xs text-[var(--muted)]">{result.artist}</p></div>
                                <button type="button" className="rounded-full border border-[var(--border)] p-2 hover:bg-[var(--hover-bg)]" onMouseDown={(event) => event.preventDefault()} onClick={() => queueTrack(result)} aria-label={t("btn_play", language)}><Play className="h-4 w-4 text-[var(--text)]" /></button>
                                <SearchResultActions resultId={result.videoId} isOpen={openActionsId === result.videoId} onToggle={() => setOpenActionsId((prev) => (prev === result.videoId ? null : result.videoId))} onClose={() => setOpenActionsId(null)} onPlayNow={() => queueTrack(result)} onAddToQueue={() => queueTrack(result, false)} onAddToFavorites={() => addFavorite({ title: result.title, artist: result.artist, coverUrl: result.thumbnailUrl })} onAddToPlaylist={(playlistId) => addSongToPlaylist(playlistId, { title: result.title, artist: result.artist, coverUrl: result.thumbnailUrl, videoId: result.videoId })} playlists={playlists} onGoToLibrary={() => router.push('/library')} />
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            {currentTrack && (
              <button
                type="button"
                className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--text)]"
                onClick={() => executeSearchQuery(currentTrack.artist)}
              >
                <span className="inline-flex items-center gap-1"><Music className="w-3 h-3 text-[var(--muted)]" />{t("search_more_like_this", language)}</span>
              </button>
            )}
          </div>
          {children}
        </main>
      </div>
      <nav className="fixed bottom-0 left-3 right-3 z-40 grid h-16 grid-cols-5 gap-2 rounded-2xl border border-border bg-surface/95 p-2 backdrop-blur md:hidden">
        {PRIMARY_NAV.map((item) => (
          <Link
            key={`mobile-${item.href}`}
            href={item.href}
            className={`flex h-full flex-col items-center justify-center rounded-xl px-2 py-1 text-xs ${pathname === item.href ? "bg-[var(--active-bg)] text-[var(--text)]" : "text-[var(--muted)]"}`}
            aria-label={t(item.key, language)}
          >
            <item.icon className="w-4 h-4 text-[var(--muted)]" />
          </Link>
        ))}
      </nav>
      <BottomPlayBar />
    </>
  );
}


export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <PlayerProvider>
      <AppShellContent>{children}</AppShellContent>
    </PlayerProvider>
  );
}
