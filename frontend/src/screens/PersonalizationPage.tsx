'use client';

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Library, Settings, Sparkles, TrendingUp } from "../../lucide-react";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { useUser } from "../context/UserContext";
import { useTheme } from "../../lib/ThemeContext";
import { readTasteProfile } from "../features/onboarding/tasteProfile";
import { scopedKey, useProfile } from "../../lib/ProfileContext";

function formatListPreview(values: string[], fallback: string) {
  if (!values.length) return fallback;
  return values.slice(0, 3).join(" · ");
}

function getTopCounts(values: string[], limit = 3): string[] {
  const counter = new Map<string, number>();
  values.forEach((value) => {
    const normalized = value.trim();
    if (!normalized) return;
    counter.set(normalized, (counter.get(normalized) ?? 0) + 1);
  });
  return [...counter.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name]) => name);
}

export default function PersonalizationPage() {
  const { user, favorites, history, isAuthenticated, updateProfile } = useUser();
  const { profile } = useProfile();
  const { theme, accent, intensity, surfaceStyle, density } = useTheme();
  const [playlistCount, setPlaylistCount] = useState(0);

  const tasteProfile = useMemo(() => readTasteProfile(), []);
  const tasteSnapshot = tasteProfile?.structured;

  const topGenres = tasteSnapshot?.genres ?? tasteProfile?.genres ?? [];
  const topMoods = tasteSnapshot?.moods ?? tasteProfile?.moods ?? [];
  const topContexts = tasteSnapshot?.contexts ?? tasteProfile?.goals ?? [];
  const topArtists = useMemo(
    () => getTopCounts([...favorites.map((item) => item.artist ?? ""), ...history.map((item) => item.artist ?? "")], 3),
    [favorites, history],
  );
  const recentHistoryCount = useMemo(() => {
    const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
    return history.filter((item) => {
      if (!item.createdAt) return false;
      const parsed = Date.parse(item.createdAt);
      return Number.isFinite(parsed) && parsed >= cutoff;
    }).length;
  }, [history]);
  const favoritesDominant = favorites.length > Math.max(2, history.length * 0.4);
  const sparseData = history.length < 5 && favorites.length < 3;

  const summaryLines = useMemo(() => {
    const identityLead = topGenres.length
      ? `You currently lean toward ${topGenres.slice(0, 2).join(" and ")}${topMoods.length ? ` with a ${topMoods[0].toLowerCase()} mood lane` : ""}.`
      : "We are still shaping your listening identity from your starter profile and early library activity.";
    const behaviorLead = sparseData
      ? "Early signal only: this summary is mostly onboarding-based until your recent history and favorites grow."
      : favoritesDominant
        ? "Your saved library is growing faster than your play history, so your current profile is favorite-led."
        : recentHistoryCount >= 4
          ? "Recent listening activity is active, and your profile is increasingly behavior-driven."
          : "Your profile blends onboarding anchors with your current history and saved music.";
    return [identityLead, behaviorLead];
  }, [favoritesDominant, recentHistoryCount, sparseData, topGenres, topMoods]);

  const tasteSignals = useMemo(() => ([
    { label: "Genre lean", value: formatListPreview(topGenres, "Not enough genre signal yet") },
    { label: "Mood lane", value: formatListPreview(topMoods, "Mood signal is still forming") },
    { label: "Context cues", value: formatListPreview(topContexts, "Add more sessions to shape contexts") },
    { label: "Library tilt", value: favoritesDominant ? "Favorite-heavy right now" : "Balanced between saves and plays" },
    { label: "Recent pattern", value: recentHistoryCount > 0 ? `${recentHistoryCount} listens in last 14 days` : "No recent history in last 14 days" },
  ]), [favoritesDominant, recentHistoryCount, topContexts, topGenres, topMoods]);

  const recommendationDataSharingEnabled = Boolean(user?.recommendationDataSharingEnabled);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(scopedKey("ponotai.library.playlists", profile.id)) ?? "[]";
      const parsed = JSON.parse(raw) as unknown[];
      setPlaylistCount(Array.isArray(parsed) ? parsed.length : 0);
    } catch {
      setPlaylistCount(0);
    }
  }, [profile.id]);

  async function handleRecommendationDataSharingToggle() {
    if (!isAuthenticated) return;
    await updateProfile({ recommendationDataSharingEnabled: !recommendationDataSharingEnabled });
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 pb-[calc(var(--layout-bottom-offset)+24px)] pt-2 sm:px-6 sm:pt-4">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Personalization hub</p>
        <h1 className="display-styled text-3xl font-semibold tracking-tight sm:text-4xl">Personalization</h1>
        <p className="max-w-3xl text-sm text-[var(--muted)]">
          This is your control center for identity, style, future rewards, and recommendation behavior.
          Some blocks are live today and some are intentionally scaffolded for upcoming roadmap passes.
        </p>
      </header>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card variant="settings" className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">Taste Identity</p>
              <h2 className="text-xl font-semibold">Your listening fingerprint</h2>
            </div>
            <Sparkles className="h-5 w-5 text-[var(--accent)]" />
          </div>
          <p className="text-sm text-[var(--muted)]">
            A grounded summary from onboarding and listening behavior. This will deepen in a later pass.
          </p>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-surface)] p-4">
            <p className="text-sm font-medium">{summaryLines[0]}</p>
            <p className="mt-2 text-xs text-[var(--muted)]">{summaryLines[1]}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tasteSignals.map((signal) => (
              <div key={signal.label} className="themed-surface-subtle rounded-xl border border-[var(--border)] p-3">
                <p className="text-xs text-[var(--muted)]">{signal.label}</p>
                <p className="mt-1 text-sm font-medium">{signal.value}</p>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-surface)] p-3 text-xs text-[var(--muted)]">
            <p>
              Evidence: favorites ({favorites.length}), listening history ({history.length}), playlists ({playlistCount})
              {topArtists.length ? `, recurring artists (${topArtists.join(" · ")})` : ""}.
            </p>
            {sparseData ? (
              <p className="mt-1">
                Still learning: signals are currently light, so Trackly is prioritizing onboarding preferences until more behavior data arrives.
              </p>
            ) : null}
            <p className="mt-1">
              Integration-ready: this block currently uses onboarding + library signals and can layer in Song Taster/UserTasteMemory depth in later passes.
            </p>
          </div>
          <div className="rounded-xl border border-dashed border-[var(--border)] p-3 text-xs text-[var(--muted)]">
            Signal scope stays curated on purpose. Internal metadata is kept private until richer layers are production-ready.
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-surface)] p-3 text-xs text-[var(--muted)]">
            <p>
              Sharing preference is currently {recommendationDataSharingEnabled ? "enabled" : "disabled"} and supports recommendation quality, but it is not treated as a taste trait.
            </p>
          </div>
        </Card>

        <Card variant="settings" className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">Theme Studio Preview</p>
              <h2 className="text-xl font-semibold">Look and feel direction</h2>
            </div>
            <Sparkles className="h-5 w-5 text-[var(--accent)]" />
          </div>
          <p className="text-sm text-[var(--muted)]">
            Preview your active visual setup. Full Theme Studio editing lands in a dedicated future pass.
          </p>
          <div className="rounded-2xl border border-[var(--accent-border)] bg-[var(--accent-soft)] p-4">
            <p className="text-xs uppercase tracking-[0.1em] text-[var(--muted)]">Current style snapshot</p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              {[`Theme: ${theme}`, `Accent: ${accent}`, `Intensity: ${intensity}`, `Surface: ${surfaceStyle}`, `Density: ${density}`].map((chip) => (
                <span key={chip} className="rounded-full border border-[var(--border)] bg-[var(--panel-surface)] px-2.5 py-1">{chip}</span>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/settings#appearance"><Button variant="secondary" size="sm"><span className="inline-flex items-center gap-2"><TrendingUp className="h-4 w-4" />Open current theme controls</span></Button></Link>
              <Button variant="ghost" size="sm" disabled>Theme Studio (coming in roadmap)</Button>
            </div>
          </div>
        </Card>

        <Card variant="settings" className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">Personalized Music Packs</p>
              <h2 className="text-xl font-semibold">Curated bundles scaffold</h2>
            </div>
            <Library className="h-5 w-5 text-[var(--accent)]" />
          </div>
          <p className="text-sm text-[var(--muted)]">
            This area will host reusable packs tuned to your identity and moments. The full packs engine is not active yet.
          </p>
          <div className="rounded-xl border border-dashed border-[var(--accent-border)] bg-[var(--accent-soft)]/60 p-4">
            <p className="text-sm font-medium">No packs generated yet</p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Planned categories: Daily Focus, Rediscovered Favorites, Mood Boost, and New Horizon.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { title: "Daily Focus", state: "Preview slot" },
              { title: "Rediscovered Favorites", state: "Preview slot" },
              { title: "Mood Boost", state: "Preview slot" },
              { title: "New Horizon", state: "Preview slot" },
            ].map((item) => (
              <div key={item.title} className="rounded-lg border border-[var(--border)] bg-[var(--panel-surface)] p-3">
                <p className="text-sm font-medium">{item.title}</p>
                <p className="text-xs text-[var(--muted)]">{item.state}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card variant="settings" className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">Recommendation Controls</p>
              <h2 className="text-xl font-semibold">How Trackly tunes suggestions</h2>
            </div>
            <Settings className="h-5 w-5 text-[var(--accent)]" />
          </div>
          <p className="text-sm text-[var(--muted)]">
            Manage recommendation behavior here. More controls (safe ↔ adventurous, novelty depth) arrive in later passes.
          </p>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-surface)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Share listening patterns to improve recommendations</p>
                <p className="mt-1 text-xs text-[var(--muted)]">Uses your preference account setting and updates instantly.</p>
              </div>
              <button
                type="button"
                onClick={handleRecommendationDataSharingToggle}
                disabled={!isAuthenticated}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${recommendationDataSharingEnabled ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--text)]" : "border-[var(--border)] bg-transparent text-[var(--muted)]"} disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {recommendationDataSharingEnabled ? "Enabled" : "Disabled"}
              </button>
            </div>
            {!isAuthenticated ? <p className="mt-2 text-xs text-[var(--muted)]">Sign in to change this preference.</p> : null}
          </div>
          <div className="rounded-xl border border-dashed border-[var(--border)] p-3 text-xs text-[var(--muted)]">
            Reserved next: Familiar ↔ Discovery balance, energy range controls, and contextual recommendation toggles.
          </div>
        </Card>
      </section>
    </div>
  );
}
