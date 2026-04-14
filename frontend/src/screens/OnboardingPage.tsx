'use client';

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Music, Radio, Sparkles, TrendingUp } from "../../lucide-react";
import { useLanguage } from "../../lib/LanguageContext";
import { t } from "../../lib/translations";
import { useUser } from "../context/UserContext";
import { readTasteProfile, type TasteProfile } from "../features/onboarding/tasteProfile";

const VIBE_OPTIONS = ["Focus", "Chill", "Energy", "Late-night", "Mood boost", "Workout"];
const DISCOVERY_OPTIONS = ["Mostly familiar", "Balanced", "Mostly discovery"];

function toList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

export default function OnboardingPage() {
  const router = useRouter();
  const { language } = useLanguage();
  const { isLoading, isAuthenticated, onboardingRequired, completeOnboarding } = useUser();

  const [genres, setGenres] = useState("");
  const [artists, setArtists] = useState("");
  const [moods, setMoods] = useState("");
  const [goals, setGoals] = useState("");
  const [vibe, setVibe] = useState(VIBE_OPTIONS[1]);
  const [discoveryStyle, setDiscoveryStyle] = useState(DISCOVERY_OPTIONS[1]);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace("/auth?tab=signup");
      return;
    }
    if (!onboardingRequired) {
      router.replace("/");
    }
  }, [isLoading, isAuthenticated, onboardingRequired, router]);

  useEffect(() => {
    const existing = readTasteProfile();
    if (!existing) return;
    setGenres(existing.genres.join(", "));
    setArtists(existing.artists.join(", "));
    setMoods(existing.moods.join(", "));
    setGoals(existing.goals.join(", "));
  }, []);

  const inputClass =
    "w-full rounded-xl border border-[var(--border)] bg-[var(--input-bg)] px-4 py-2.5 text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]";

  const profile = useMemo<TasteProfile>(() => ({
    genres: toList(genres),
    artists: toList(artists),
    moods: Array.from(new Set([...toList(moods), vibe])),
    goals: Array.from(new Set([...toList(goals), discoveryStyle])),
    completedAt: new Date().toISOString(),
    skipped: false,
  }), [artists, discoveryStyle, genres, goals, moods, vibe]);

  function finish(skip = false) {
    completeOnboarding({
      genres: skip ? [] : profile.genres,
      artists: skip ? [] : profile.artists,
      moods: skip ? [] : profile.moods,
      goals: skip ? [] : profile.goals,
      completedAt: new Date().toISOString(),
      skipped: skip,
    });
    router.replace("/");
  }

  return (
    <main className="mx-auto flex min-h-[80vh] w-full max-w-2xl items-center px-4 py-8">
      <section className="w-full rounded-3xl border border-[var(--panel-border)] bg-[var(--panel-surface)] p-5 shadow-[0_20px_45px_rgba(var(--accent-rgb),0.14)] sm:p-7">
        <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--text)]">
          <Sparkles className="h-3.5 w-3.5 text-[var(--accent)]" /> Starter personalization
        </p>
        <h1 className="text-2xl font-semibold text-[var(--text)]">{t("onboarding_title", language)}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">{t("onboarding_desc", language)}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {["Mobile-first", "Theme-aware", "Used for AI starter cues"].map((hint) => (
            <span key={hint} className="rounded-full border border-[var(--border)] bg-[var(--surface-subtle)] px-2.5 py-1 text-xs text-[var(--muted)]">
              {hint}
            </span>
          ))}
        </div>

        <div className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-1 inline-flex items-center gap-2 text-sm"><Music className="h-4 w-4 text-[var(--muted)]" /> {t("onboarding_genres", language)}</span>
            <input className={inputClass} value={genres} placeholder="rock, pop, electronic" onChange={(event) => setGenres(event.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 inline-flex items-center gap-2 text-sm"><Sparkles className="h-4 w-4 text-[var(--muted)]" /> {t("onboarding_artists", language)}</span>
            <input className={inputClass} value={artists} placeholder="Daft Punk, Dua Lipa" onChange={(event) => setArtists(event.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 inline-flex items-center gap-2 text-sm"><Radio className="h-4 w-4 text-[var(--muted)]" /> {t("onboarding_moods", language)}</span>
            <input className={inputClass} value={moods} placeholder="calm, energetic, cinematic" onChange={(event) => setMoods(event.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 inline-flex items-center gap-2 text-sm"><TrendingUp className="h-4 w-4 text-[var(--muted)]" /> {t("onboarding_goals", language)}</span>
            <input className={inputClass} value={goals} placeholder="focus, gym, commute" onChange={(event) => setGoals(event.target.value)} />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] p-3 text-sm">
              <span className="mb-1 block text-xs uppercase tracking-wide text-[var(--muted)]">Preferred vibe</span>
              <select className={`${inputClass} py-2`} value={vibe} onChange={(event) => setVibe(event.target.value)}>
                {VIBE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label className="rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] p-3 text-sm">
              <span className="mb-1 block text-xs uppercase tracking-wide text-[var(--muted)]">Recommendation style</span>
              <select className={`${inputClass} py-2`} value={discoveryStyle} onChange={(event) => setDiscoveryStyle(event.target.value)}>
                {DISCOVERY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--muted)] hover:bg-[var(--hover-bg)]" onClick={() => finish(true)}>
            {t("onboarding_skip", language)}
          </button>
          <button type="button" className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-foreground)] hover:opacity-90" onClick={() => finish(false)}>
            {t("onboarding_save", language)}
          </button>
        </div>
      </section>
    </main>
  );
}
