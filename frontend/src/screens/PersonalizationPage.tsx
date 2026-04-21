'use client';

import Link from "next/link";
import { useMemo } from "react";
import { Library, Settings, Sparkles, TrendingUp } from "../../lucide-react";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { useUser } from "../context/UserContext";
import { useTheme } from "../../lib/ThemeContext";
import { readTasteProfile } from "../features/onboarding/tasteProfile";

function formatListPreview(values: string[], fallback: string) {
  if (!values.length) return fallback;
  return values.slice(0, 3).join(" · ");
}

export default function PersonalizationPage() {
  const { user, favorites, history, isAuthenticated, updateProfile } = useUser();
  const { theme, accent, intensity, surfaceStyle, density } = useTheme();

  const tasteProfile = useMemo(() => readTasteProfile(), []);
  const tasteSnapshot = tasteProfile?.structured;

  const topGenres = tasteSnapshot?.genres ?? tasteProfile?.genres ?? [];
  const topMoods = tasteSnapshot?.moods ?? tasteProfile?.moods ?? [];
  const topContexts = tasteSnapshot?.contexts ?? tasteProfile?.goals ?? [];

  const recommendationDataSharingEnabled = Boolean(user?.recommendationDataSharingEnabled);

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
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="themed-surface-subtle rounded-xl border border-[var(--border)] p-3">
              <p className="text-xs text-[var(--muted)]">Core genres</p>
              <p className="mt-1 text-sm font-medium">{formatListPreview(topGenres, "Complete onboarding to set your first taste anchors")}</p>
            </div>
            <div className="themed-surface-subtle rounded-xl border border-[var(--border)] p-3">
              <p className="text-xs text-[var(--muted)]">Mood lane</p>
              <p className="mt-1 text-sm font-medium">{formatListPreview(topMoods, "No mood profile yet")}</p>
            </div>
            <div className="themed-surface-subtle rounded-xl border border-[var(--border)] p-3 sm:col-span-2">
              <p className="text-xs text-[var(--muted)]">Context cues</p>
              <p className="mt-1 text-sm font-medium">{formatListPreview(topContexts, "Focus, workout, commute, and more will appear as you use Trackly")}</p>
            </div>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-surface)] p-3 text-xs text-[var(--muted)]">
            Signals used now: onboarding taste profile, favorites ({favorites.length}), listening history ({history.length}).
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
