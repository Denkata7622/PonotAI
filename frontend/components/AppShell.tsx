"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import BottomPlayBar from "./BottomPlayBar";
import { PlayerProvider } from "./PlayerProvider";
import type { Playlist } from "../features/library/types";
import { scopedKey, useProfile } from "../lib/ProfileContext";
import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/translations";
import { useUser } from "../src/context/UserContext";

type HistoryItem = {
  id: string;
  createdAt?: string;
  song?: { songName?: string; artist?: string };
};

type LibrarySnapshot = {
  favorites: string[];
  playlists: Playlist[];
};

const PRIMARY_NAV = [
  { href: "/", key: "nav_listen", icon: "🎧" },
  { href: "/library", key: "nav_library", icon: "📚" },
  { href: "/search", key: "nav_search", icon: "🔍" },
  { href: "/profile", key: "nav_profile", icon: "👤" },
  { href: "/settings", key: "nav_settings", icon: "⚙️" },
] as const;

const SECONDARY_NAV = [
  { href: "/about", key: "nav_about", icon: "ℹ️" },
  { href: "/how-to-use", key: "nav_how_to_use", icon: "❓" },
  { href: "/concept", key: "nav_concept", icon: "🧠" },
  { href: "/idea", key: "nav_idea", icon: "💡" },
  { href: "/founders", key: "nav_founders", icon: "🧑‍💻" },
  { href: "/the-future", key: "nav_the_future", icon: "🚀" },
  { href: "/stats", key: "nav_stats", icon: "📊" },
] as const;

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { language } = useLanguage();
  const { profile } = useProfile();
  const { user, isAuthenticated, logout } = useUser();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [recentHistory, setRecentHistory] = useState<HistoryItem[]>([]);
  const [librarySnapshot, setLibrarySnapshot] = useState<LibrarySnapshot>({ favorites: [], playlists: [] });
  const [showUserMenu, setShowUserMenu] = useState(false);

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

  async function handleLogout() {
    await logout();
    setShowUserMenu(false);
    router.push("/");
  }

  // Avatar initials
  const initials = (user?.username ?? "G")
    .split(" ")
    .map((c) => c[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <PlayerProvider>
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
              {isCollapsed ? "»" : "«"}
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
                    <span className="text-[var(--muted)]">▾</span>
                  </button>

                  {showUserMenu && (
                    <div className="absolute left-0 right-0 top-10 z-20 rounded-xl border border-[var(--border)] bg-[var(--surface-2,var(--surface))] p-2 shadow-xl">
                      <Link
                        href="/profile"
                        className="block rounded-lg px-3 py-2 text-sm hover:bg-[var(--hover-bg)]"
                        onClick={() => setShowUserMenu(false)}
                      >
                        👤 {language === "bg" ? "Профил" : "Profile"}
                      </Link>
                      <Link
                        href="/settings"
                        className="block rounded-lg px-3 py-2 text-sm hover:bg-[var(--hover-bg)]"
                        onClick={() => setShowUserMenu(false)}
                      >
                        ⚙️ {language === "bg" ? "Настройки" : "Settings"}
                      </Link>
                      <button
                        className="w-full rounded-lg px-3 py-2 text-left text-sm text-red-400 hover:bg-[var(--hover-bg)]"
                        onClick={handleLogout}
                      >
                        🚪 {language === "bg" ? "Изход" : "Sign out"}
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
                    👤
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
                <span>{item.icon}</span>
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
                  <span>{item.icon}</span>
                  {!isCollapsed && <span>{t(item.key, language)}</span>}
                </Link>
              ))}
            </nav>
          </div>
        </aside>

        <main className="flex-1 px-4 pb-36 pt-6 sm:px-8 sm:pt-8">{children}</main>
      </div>
      <nav className="fixed bottom-24 left-3 right-3 z-40 grid grid-cols-5 gap-2 rounded-2xl border border-border bg-surface/95 p-2 backdrop-blur md:hidden">
        {PRIMARY_NAV.map((item) => (
          <Link
            key={`mobile-${item.href}`}
            href={item.href}
            className={`flex flex-col items-center justify-center rounded-xl px-2 py-1 text-xs ${pathname === item.href ? "bg-[var(--active-bg)] text-[var(--text)]" : "text-[var(--muted)]"}`}
            aria-label={t(item.key, language)}
          >
            <span>{item.icon}</span>
          </Link>
        ))}
      </nav>
      <BottomPlayBar />
    </PlayerProvider>
  );
}