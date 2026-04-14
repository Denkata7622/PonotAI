"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BarChart2, ChevronDown, ChevronLeft, ChevronRight, Clock, EllipsisVertical, Headphones, Heart, HelpCircle, Info, Library, LogOut, Music, Play, Search, SearchX, Settings, Sparkles, TrendingUp, User, WifiOff, X } from "../lucide-react";
import BottomPlayBar from "./BottomPlayBar";
import DualSidebarHost from "@/src/components/sidebars/DualSidebarHost";
import { PlayerProvider } from "./PlayerProvider";
import { useLibrary } from "../features/library/useLibrary";
import { useProfile } from "../lib/ProfileContext";
import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/translations";
import { useUser } from "../src/context/UserContext";
import { usePlayer } from "./PlayerProvider";
import type { QueueTrack } from "../features/player/state";
import SearchInput from "./SearchInput";
import SearchResultActions from "./SearchResultActions";
import { addSongToPlaylist as addSongToPlaylistApi } from "../features/library/api";
import { formatArtist } from "../lib/formatArtist";
import SmartDropdown from "@/src/components/ui/SmartDropdown";
import { runUnifiedSearch, type PersonalizedSearchResult } from "../lib/searchClient";

type HistoryItem = {
  id: string;
  createdAt?: string;
  title?: string;
  artist?: string;
};

type SearchResult = {
  videoId: string;
  title: string;
  artist: string;
  thumbnailUrl: string;
  isTopicChannel?: boolean;
};

const PRIMARY_NAV = [
  { href: "/", key: "nav_listen", icon: Headphones },
  { href: "/library", key: "nav_library", icon: Library },
  { href: "/search", key: "nav_search", icon: Search },
  { href: "/assistant", key: "nav_assistant", icon: Sparkles },
  { href: "/profile", key: "nav_profile", icon: User },
  { href: "/settings", key: "nav_settings", icon: Settings },
] as const;

const SECONDARY_NAV = [
  { href: "/docs", key: "nav_docs", icon: HelpCircle },
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
  const { user, token, isAuthenticated, logout, addFavorite, addToHistory, history, favorites } = useUser();
  const { playlists } = useLibrary(profile.id);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const { addToQueue, playNow, currentTrack } = usePlayer();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [isSearchUnavailable, setIsSearchUnavailable] = useState(false);
  const [personalizedResults, setPersonalizedResults] = useState<PersonalizedSearchResult[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [openActionsId, setOpenActionsId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const blurTimeoutRef = useRef<number | null>(null);
  const mobileNavRef = useRef<HTMLElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const suggestedQueries = ["Азис", "Глория", "Слави Трифонов", "Преслава", "Sabaton", "Linkin Park", "The Weeknd", "Eminem"];

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setShowMobileMenu(false);
  }, [pathname]);

  useEffect(() => {
    const updateMobileNavHeight = () => {
      const isMobile = window.matchMedia("(max-width: 767px)").matches;
      const navHeight = isMobile ? (mobileNavRef.current?.getBoundingClientRect().height ?? 0) : 0;
      document.documentElement.style.setProperty("--mobile-nav-height", `${Math.round(navHeight)}px`);
    };
    updateMobileNavHeight();
    const observer = new ResizeObserver(updateMobileNavHeight);
    if (mobileNavRef.current) observer.observe(mobileNavRef.current);
    window.addEventListener("resize", updateMobileNavHeight);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateMobileNavHeight);
      document.documentElement.style.setProperty("--mobile-nav-height", "0px");
    };
  }, []);

  const isNavItemActive = (href: string) => {
    if (href === "/library") {
      return pathname === href || pathname.startsWith(`${href}/`);
    }
    return pathname === href;
  };

  const recentHistory = useMemo<HistoryItem[]>(
    () => [...history].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")).slice(0, 5),
    [history],
  );

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
    if (typeof window === "undefined") return;
    try {
      const stored = JSON.parse(window.localStorage.getItem("trackly.search.recent") ?? "[]") as string[];
      setRecentSearches(Array.isArray(stored) ? stored : []);
    } catch {
      setRecentSearches([]);
    }
  }, []);

  function saveQuery(q: string) {
    if (!q || q.length < 2 || typeof window === "undefined") return;
    setRecentSearches((prev) => {
      const deduped = [q, ...prev.filter((item) => item.toLowerCase() !== q.toLowerCase())].slice(0, 5);
      window.localStorage.setItem("trackly.search.recent", JSON.stringify(deduped));
      return deduped;
    });
  }

  function clearRecent() {
    setRecentSearches([]);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("trackly.search.recent", "[]");
    }
  }

  function removeRecent(item: string) {
    if (typeof window === "undefined") return;
    setRecentSearches((prev) => {
      const next = prev.filter((search) => search !== item);
      window.localStorage.setItem("trackly.search.recent", JSON.stringify(next));
      return next;
    });
  }

  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      setIsSearchUnavailable(false);
      setPersonalizedResults([]);
      setHighlightedIndex(-1);
      return;
    }
    let cancelled = false;
    setIsSearching(true);
    runUnifiedSearch(debouncedQuery, token)
      .then((response) => {
        if (cancelled) return;
        setIsSearchUnavailable(response.isUnavailable);
        setPersonalizedResults(response.personalized.slice(0, 5));
        const nextResults = response.discover.slice(0, 8).map((item) => ({ ...item, isTopicChannel: item.artist.endsWith("- Topic"), artist: formatArtist(item.artist) }));
        if (!response.isUnavailable) {
          saveQuery(debouncedQuery);
        }
        setSearchResults(nextResults);
        setHighlightedIndex(nextResults.length > 0 ? 0 : -1);
      })
      .catch(() => {
        if (!cancelled) {
          setIsSearchUnavailable(true);
          setSearchResults([]);
          setPersonalizedResults([]);
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
  }, [debouncedQuery, token]);

  function queueTrack(result: SearchResult, playImmediately = true, closeDropdown = true) {
    const trackPayload: Omit<QueueTrack, "id"> & { id?: string } = {
      title: result.title,
      artist: result.artist,
      artistId: result.videoId,
      artworkUrl: result.thumbnailUrl,
      videoId: result.videoId,
      query: `${result.title} ${result.artist}`,
      license: "COPYRIGHTED",
    };
    if (playImmediately) {
      playNow(trackPayload, "manual");
    } else {
      addToQueue(trackPayload, "manual");
    }
    if (closeDropdown) setShowSearchDropdown(false);
  }

  function handleSelectSearchResult(result: SearchResult) {
    queueTrack(result, true);
    window.dispatchEvent(new CustomEvent("ponotai-toast", { detail: { text: `Now playing: ${result.title}` } }));
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
      if (target) queueTrack(target, true);
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
    const songs = searchResults.filter((result) => !result.isTopicChannel);
    const channels = searchResults.filter((result) => result.isTopicChannel);
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
      <div className="flex min-h-[100dvh]">
        {/* Sidebar */}
        <aside
          className={`hidden p-4 backdrop-blur-xl transition-all md:block ${isCollapsed ? "w-20" : "w-72"}`}
          style={{ background: "var(--sidebar-bg)", borderRight: "1px solid var(--sidebar-border)", boxShadow: "var(--sidebar-shadow)" }}
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
            <div className="mb-4 rounded-xl border border-[var(--panel-border)] bg-[var(--panel-surface)] p-3 text-xs">
              {isAuthenticated && user ? (
                <SmartDropdown
                  isOpen={showUserMenu}
                  onOpenChange={setShowUserMenu}
                placement="bottom-start"
                matchTriggerWidth
                className="p-2 text-[var(--text)] [backdrop-filter:none]"
                  trigger={(
                    <button
                      className="flex w-full items-center gap-2 text-left"
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
                  )}
                >
                  <Link
                    href="/profile"
                    className="dropdown-item block rounded-lg px-3 py-2 text-sm text-[var(--text)]"
                    onClick={() => setShowUserMenu(false)}
                  >
                    <span className="inline-flex items-center gap-2"><User className="w-4 h-4 text-[var(--muted)]" />{language === "bg" ? "Профил" : "Profile"}</span>
                  </Link>
                  <Link
                    href="/settings"
                    className="dropdown-item block rounded-lg px-3 py-2 text-sm text-[var(--text)]"
                    onClick={() => setShowUserMenu(false)}
                  >
                    <span className="inline-flex items-center gap-2"><Settings className="w-4 h-4 text-[var(--muted)]" />{language === "bg" ? "Настройки" : "Settings"}</span>
                  </Link>
                  <button
                    className="dropdown-item status-danger w-full rounded-lg px-3 py-2 text-left text-sm"
                    onClick={handleLogout}
                  >
                    <span className="inline-flex items-center gap-2"><LogOut className="w-4 h-4 text-[var(--muted)]" />{language === "bg" ? "Изход" : "Sign out"}</span>
                  </button>
                </SmartDropdown>
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
                  <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--panel-border)] bg-[var(--panel-surface)] text-base">
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
                className={isNavItemActive(item.href) ? "navItemActive" : "navItem"}
                href={item.href}
              >
                <item.icon className="w-4 h-4 text-[var(--muted)]" />
                {!isCollapsed && <span>{t(item.key, language)}</span>}
              </Link>
            ))}
          </nav>

          {/* Recent history panel */}
          {!isCollapsed && pathname === "/" && (
            <div className="mt-6 space-y-4 rounded-xl border border-[var(--panel-border)] bg-[var(--panel-surface)] p-3 text-xs">
              <h3 className="text-sm font-semibold text-[var(--text)]">
                {t("sidebar_recent_history", language)}
              </h3>
              <ul className="space-y-1 text-[var(--muted)]">
                {recentHistory.length === 0 && <li>{t("history_empty", language)}</li>}
                    {recentHistory.map((item) => (
                  <li key={item.id} className="truncate">
                    • {item.title ?? "-"} — {item.artist ?? "-"}
                  </li>
                ))}
              </ul>
              <div className="rounded-lg border border-[var(--border)] bg-[var(--input-bg)] p-2 text-[var(--muted)]">
                <div>{t("sidebar_total_recognized", language)}: {recentHistory.length}</div>
                <div>{t("sidebar_today_count", language)}: {recognizedToday}</div>
                <div>{t("library_favorites", language)}: {favorites.length}</div>
              </div>
            </div>
          )}

          {!isCollapsed && pathname === "/library" && (
            <div className="mt-6 space-y-2 rounded-xl border border-[var(--panel-border)] bg-[var(--panel-surface)] p-3 text-xs text-[var(--muted)]">
              <h3 className="text-sm font-semibold text-[var(--text)]">{t("library_playlists", language)}</h3>
              {playlists.map((playlist) => (
                <p key={playlist.id}>• {playlist.name} ({playlist.songs.length})</p>
              ))}
              {playlists.length === 0 && <p>{t("no_playlists_created", language)}</p>}
            </div>
          )}

          {/* Secondary nav */}
          <div className="mt-6 border-t border-[var(--border)] pt-4">
            <nav className="flex flex-col gap-2 text-sm">
              {SECONDARY_NAV.map((item) => (
                <Link
                  key={item.href}
                  className={isNavItemActive(item.href) ? "navItemActive" : "navItem"}
                  href={item.href}
                >
                  <item.icon className="w-4 h-4 text-[var(--muted)]" />
                  {!isCollapsed && <span>{t(item.key, language)}</span>}
                </Link>
              ))}
            </nav>
          </div>
        </aside>

        <main
          key={pathname}
          className="pageTransition flex min-h-0 min-w-0 flex-1 flex-col px-2 pt-4 sm:px-6 sm:pt-6"
          style={{ paddingBottom: "calc(var(--layout-bottom-offset, var(--player-bar-height, 88px)) + 24px)" }}
        >
          <div className="mx-auto flex w-full max-w-7xl min-w-0 flex-1 flex-col">
          {pathname !== "/search" ? <div className="sticky top-[env(safe-area-inset-top,0px)] z-30 mb-4 flex flex-col gap-2 bg-[var(--bg)]/90 pb-2 pt-1 backdrop-blur md:static md:flex-row md:items-center md:bg-transparent md:pb-0 md:pt-0 md:backdrop-blur-0">
            <div className="relative flex-1 pointer-events-none">
              <SmartDropdown
                isOpen={showSearchDropdown}
                onOpenChange={(open) => {
                  setShowSearchDropdown(open);
                  if (!open) setOpenActionsId(null);
                }}
                placement="bottom-start"
                matchTriggerWidth
                className="pointer-events-auto w-full rounded-2xl p-2"
                enableClickTrigger={false}
                trigger={(
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
                )}
              >
                  {!query.trim() ? (
                    recentSearches.length > 0 ? (
                      <div>
                        <div className="mb-1 flex items-center justify-between px-2 py-1">
                          <p className="inline-flex items-center gap-2 text-sm text-[var(--muted)]"><Clock className="w-4 h-4 text-[var(--muted)]" />{t("search_recent", language)}</p>
                          <button type="button" className="text-xs text-[var(--muted)] hover:text-[var(--text)]" onMouseDown={(event) => event.preventDefault()} onClick={clearRecent}>{t("search_clear_recent", language)}</button>
                        </div>
                        <ul className="space-y-1">
                          {recentSearches.map((item) => (
                            <li key={item} className="dropdown-item flex items-center gap-2 rounded-lg px-2 py-2">
                              <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onMouseDown={(event) => { event.preventDefault(); executeSearchQuery(item); }}>
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
                            <button key={item} type="button" className="dropdown-item rounded-full border border-[var(--panel-border)] bg-[var(--panel-surface)] px-3 py-1 text-sm" onMouseDown={(event) => { event.preventDefault(); executeSearchQuery(item); }}>{item}</button>
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
                  ) : personalizedResults.length > 0 && searchResults.length === 0 ? (
                    <div className="space-y-2 px-3 py-2">
                      <p className="text-xs uppercase tracking-wider text-[var(--muted)]">Your Library</p>
                      <ul className="space-y-1">
                        {personalizedResults.map((item) => (
                          <li key={item.id} className="text-sm text-[var(--text)]">
                            {item.title} {item.artist ? `— ${item.artist}` : ""} <span className="text-xs text-[var(--muted)]">({item.type})</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : query === debouncedQuery && searchResults.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 px-3 py-4 text-center text-[var(--muted)]">
                      <SearchX className="w-8 h-8 text-[var(--muted)]" />
                      <p className="text-sm">{t("search_no_results_for", language)} "{debouncedQuery}"</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="px-2 text-xs uppercase tracking-wider text-[var(--muted)]">Songs</p>
                      <ul className="space-y-1">
                        {groupedSearchResults.songs.map((result, index) => (
                          <li
                            key={result.videoId}
                            className={`dropdown-item flex items-center gap-3 rounded-xl px-2 py-2 ${highlightedIndex === index ? "bg-[var(--hover-bg)]" : ""}`}
                            onMouseDown={(event) => {
                              event.preventDefault();
                              handleSelectSearchResult(result);
                            }}
                          >
                            <img src={result.thumbnailUrl} alt={result.title} className="h-10 w-10 rounded-md object-cover" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-[var(--text)]">{result.title}</p>
                              <p className="truncate text-xs text-[var(--muted)]">{result.artist}</p>
                            </div>
                            <button
                              type="button"
                              className="rounded-full border border-[var(--border)] p-2 hover:bg-[var(--hover-bg)]"
                              onMouseDown={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                handleSelectSearchResult(result);
                              }}
                              aria-label={t("btn_play", language)}
                            >
                              <Play className="h-4 w-4 text-[var(--text)]" />
                            </button>
                            <SearchResultActions
                              resultId={result.videoId}
                              isOpen={openActionsId === result.videoId}
                              onToggle={() => setOpenActionsId((prev) => (prev === result.videoId ? null : result.videoId))}
                              onClose={() => setOpenActionsId(null)}
                              onPlayNow={() => queueTrack(result, true)}
                              onAddToQueue={() => queueTrack(result, false, false)}
                              onSaveToRecent={() => saveResultToRecent(result)}
                              onAddToFavorites={() => addFavorite({ title: result.title, artist: result.artist, coverUrl: result.thumbnailUrl })}
                              onAddToPlaylist={(playlistId) => addSongToPlaylistApi(playlistId, { title: result.title, artist: result.artist, coverUrl: result.thumbnailUrl, videoId: result.videoId })}
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
                              <li
                                key={result.videoId}
                                className="flex items-center gap-3 rounded-xl px-2 py-2"
                                onMouseDown={(event) => {
                                  event.preventDefault();
                                  handleSelectSearchResult(result);
                                }}
                              >
                                <img src={result.thumbnailUrl} alt={result.title} className="h-10 w-10 rounded-md object-cover" />
                                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-[var(--text)]">{result.title}</p><p className="truncate text-xs text-[var(--muted)]">{result.artist}</p></div>
                                <button
                                  type="button"
                                  className="rounded-full border border-[var(--border)] p-2 hover:bg-[var(--hover-bg)]"
                                  onMouseDown={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    handleSelectSearchResult(result);
                                  }}
                                  aria-label={t("btn_play", language)}
                                ><Play className="h-4 w-4 text-[var(--text)]" /></button>
                                <SearchResultActions resultId={result.videoId} isOpen={openActionsId === result.videoId} onToggle={() => setOpenActionsId((prev) => (prev === result.videoId ? null : result.videoId))} onClose={() => setOpenActionsId(null)} onPlayNow={() => queueTrack(result, true)} onAddToQueue={() => queueTrack(result, false, false)} onSaveToRecent={() => saveResultToRecent(result)} onAddToFavorites={() => addFavorite({ title: result.title, artist: result.artist, coverUrl: result.thumbnailUrl })} onAddToPlaylist={(playlistId) => addSongToPlaylistApi(playlistId, { title: result.title, artist: result.artist, coverUrl: result.thumbnailUrl, videoId: result.videoId })} playlists={playlists} onGoToLibrary={() => router.push('/library')} />
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>
                  )}
              </SmartDropdown>
            </div>
            {mounted && currentTrack && (
              <button
                type="button"
                className="hidden rounded-full border border-[var(--panel-border)] bg-[var(--panel-surface)] px-2 py-1 text-xs text-[var(--muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--text)] md:inline-flex"
                onClick={() => executeSearchQuery(currentTrack.artist)}
              >
                <span className="inline-flex items-center gap-1"><Music className="w-3 h-3 text-[var(--muted)]" />{t("search_more_like_this", language)}</span>
              </button>
            )}
          </div> : null}
          {children}
          </div>
        </main>
      </div>
      {showMobileMenu ? <button type="button" className="fixed inset-0 z-40 bg-black/45 md:hidden" onClick={() => setShowMobileMenu(false)} aria-label="Close mobile menu" /> : null}
      <nav
        ref={mobileNavRef}
        className="fixed bottom-[calc(var(--player-bar-height,88px)+env(safe-area-inset-bottom,0px)+8px)] left-2 right-2 z-[45] rounded-2xl border border-border bg-surface/95 p-2 shadow-xl backdrop-blur md:hidden"
      >
        <div className="grid h-14 grid-cols-5 gap-2">
        {[
          { href: "/", key: "nav_listen", icon: Headphones },
          { href: "/search", key: "nav_search", icon: Search },
          { href: "/library", key: "nav_library", icon: Library },
          { href: "/assistant", key: "nav_assistant", icon: Sparkles },
        ].map((item) => (
          <Link
            key={`mobile-${item.href}`}
            href={item.href}
            className={`flex h-full flex-col items-center justify-center px-2 py-1 text-xs ${isNavItemActive(item.href) ? "navItemActive" : "navItem"}`}
            aria-label={t(item.key as Parameters<typeof t>[0], language)}
            onClick={() => setShowMobileMenu(false)}
          >
            <item.icon className="w-4 h-4 text-[var(--muted)]" />
          </Link>
        ))}
          <button type="button" className={`flex h-full flex-col items-center justify-center px-2 py-1 text-xs ${showMobileMenu ? "navItemActive" : "navItem"}`} onClick={() => setShowMobileMenu((prev) => !prev)} aria-label="Open menu">
            <EllipsisVertical className="w-4 h-4 text-[var(--muted)]" />
          </button>
        </div>
        {showMobileMenu ? (
          <div className="mt-2 grid grid-cols-2 gap-2 border-t border-border pt-2">
            {[
              { href: "/profile", label: t("nav_profile", language), icon: User },
              { href: "/settings", label: t("nav_settings", language), icon: Settings },
              { href: "/stats", label: t("nav_stats", language), icon: BarChart2 },
              { href: "/about", label: t("nav_about", language), icon: Info },
              { href: "/how-to-use", label: t("nav_how_to_use", language), icon: HelpCircle },
              ...(user?.role === "admin" ? [{ href: "/admin", label: "Admin", icon: Settings }] : []),
            ].map((item) => (
                <Link key={`mobile-menu-${item.href}`} href={item.href} className={isNavItemActive(item.href) ? "navItemActive text-xs" : "navItem text-xs"} onClick={() => setShowMobileMenu(false)}>
                  <item.icon className="h-4 w-4 text-[var(--muted)]" />
                  <span className="truncate">{item.label}</span>
                </Link>
              ))}
          </div>
        ) : null}
      </nav>
      <DualSidebarHost />
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
