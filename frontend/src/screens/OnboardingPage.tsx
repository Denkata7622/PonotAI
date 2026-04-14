'use client';

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Music, Radio, Sparkles, TrendingUp, Zap } from "../../lucide-react";
import { useLanguage } from "../../lib/LanguageContext";
import { t } from "../../lib/translations";
import { useUser } from "../context/UserContext";
import {
  CONTEXT_OPTIONS,
  DISCOVERY_OPENNESS_OPTIONS,
  ENERGY_OPTIONS,
  GENRE_OPTIONS,
  MOOD_OPTIONS,
  RECOMMENDATION_STYLE_OPTIONS,
  VIBE_OPTIONS,
  mapStructuredToLegacy,
  normalizeTasteProfile,
  readTasteProfile,
  type DiscoveryOpenness,
  type EnergyPreference,
  type RecommendationStyle,
  type StructuredTasteProfile,
  type TasteProfile,
  type VibePreference,
} from "../features/onboarding/tasteProfile";

function toggleValue(current: string[], value: string, max = 8): string[] {
  if (current.includes(value)) return current.filter((item) => item !== value);
  return [...current, value].slice(0, max);
}

function splitArtistInput(value: string): string[] {
  return Array.from(new Set(value.split(",").map((entry) => entry.trim()).filter(Boolean))).slice(0, 8);
}

const COPY = {
  en: {
    starterTitle: "Starter personalization",
    helper: "Structured picks help us personalize recommendations and AI replies before your listening history grows.",
    editable: "You can change these later in Settings.",
    genresHelp: "Pick up to 6 genres you actually listen to.",
    moodsHelp: "Choose moods that should shape queue and AI suggestions.",
    contextsHelp: "Tell us where recommendations should work best.",
    recommendationStyle: "Recommendation style",
    recommendationHelp: "How adventurous should suggestions be?",
    energy: "Energy preference",
    energyHelp: "Set your baseline intensity.",
    discovery: "Discovery openness",
    discoveryHelp: "How often should AI leave your comfort zone?",
    vibe: "Default vibe",
    vibeHelp: "Used as a quick fallback starter signal.",
    optionalArtists: "Optional artists",
    optionalArtistsHelp: "Optional: add a few artists to sharpen starter matching.",
    artistsPlaceholder: "Daft Punk, Fred again.., Dua Lipa",
    optionalOtherGenre: "Other genre (optional)",
    otherGenrePlaceholder: "e.g. Synthwave",
    progress: "Onboarding progress",
    selected: "selected",
    mostlyFamiliar: "Mostly familiar",
    balanced: "Balanced",
    mostlyDiscovery: "Mostly discovery",
    low: "Low",
    medium: "Medium",
    high: "High",
    mixed: "Mixed",
  },
  bg: {
    starterTitle: "Стартова персонализация",
    helper: "Структурираните избори помагат за препоръки и AI отговори още преди да имаш история.",
    editable: "Можеш да ги промениш по-късно от Настройки.",
    genresHelp: "Избери до 6 жанра, които наистина слушаш.",
    moodsHelp: "Избери настроения, които да влияят на queue и AI предложенията.",
    contextsHelp: "Къде искаш препоръките да работят най-добре?",
    recommendationStyle: "Стил на препоръките",
    recommendationHelp: "Колко авантюристични да са предложенията?",
    energy: "Предпочитана енергия",
    energyHelp: "Определи обичайната интензивност.",
    discovery: "Отвореност към ново",
    discoveryHelp: "Колко често AI да излиза извън зоната ти на комфорт?",
    vibe: "Основен vibe",
    vibeHelp: "Използва се като стартов сигнал при липса на история.",
    optionalArtists: "Любими изпълнители (по избор)",
    optionalArtistsHelp: "По желание: добави няколко изпълнители за по-точен старт.",
    artistsPlaceholder: "Azis, Dua Lipa, The Weeknd",
    optionalOtherGenre: "Друг жанр (по избор)",
    otherGenrePlaceholder: "напр. Synthwave",
    progress: "Прогрес",
    selected: "избрани",
    mostlyFamiliar: "По-познато",
    balanced: "Баланс",
    mostlyDiscovery: "Повече откриване",
    low: "Ниска",
    medium: "Средна",
    high: "Висока",
    mixed: "Смесена",
  },
} as const;

function OptionChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition sm:text-sm ${
        active
          ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--text)]"
          : "border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--muted)] hover:border-[var(--accent-border)] hover:text-[var(--text)]"
      }`}
    >
      {active ? <Check className="h-3.5 w-3.5 text-[var(--accent)]" /> : null}
      {label}
    </button>
  );
}

function ChoiceCard({
  title,
  description,
  active,
  onClick,
}: {
  title: string;
  description?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
        active
          ? "border-[var(--accent-border)] bg-[var(--accent-soft)] shadow-[0_8px_24px_rgba(var(--accent-rgb),0.16)]"
          : "border-[var(--border)] bg-[var(--surface-subtle)] hover:border-[var(--accent-border)]"
      }`}
    >
      <p className="text-sm font-semibold text-[var(--text)]">{title}</p>
      {description ? <p className="mt-1 text-xs text-[var(--muted)]">{description}</p> : null}
    </button>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const { language } = useLanguage();
  const { isLoading, isAuthenticated, onboardingRequired, completeOnboarding } = useUser();
  const [genres, setGenres] = useState<string[]>([]);
  const [moods, setMoods] = useState<string[]>([]);
  const [contexts, setContexts] = useState<string[]>([]);
  const [otherGenreInput, setOtherGenreInput] = useState("");
  const [artistsInput, setArtistsInput] = useState("");
  const [vibe, setVibe] = useState<VibePreference>("Chill");
  const [recommendationStyle, setRecommendationStyle] = useState<RecommendationStyle>("balanced");
  const [energy, setEnergy] = useState<EnergyPreference>("mixed");
  const [discoveryOpenness, setDiscoveryOpenness] = useState<DiscoveryOpenness>("medium");
  const lang = language === "bg" ? "bg" : "en";
  const copy = COPY[lang];

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
    const normalized = normalizeTasteProfile(existing);
    setGenres(normalized.structured?.genres ?? []);
    setMoods(normalized.structured?.moods ?? []);
    setContexts(normalized.structured?.contexts ?? []);
    setVibe(normalized.structured?.vibe ?? "Chill");
    setRecommendationStyle(normalized.structured?.recommendationStyle ?? "balanced");
    setEnergy(normalized.structured?.energy ?? "mixed");
    setDiscoveryOpenness(normalized.structured?.discoveryOpenness ?? "medium");
    setOtherGenreInput((normalized.structured?.otherGenres ?? []).join(", "));
    setArtistsInput((normalized.structured?.favoriteArtists ?? normalized.artists ?? []).join(", "));
  }, []);

  const profile = useMemo<TasteProfile>(() => {
    const structured: StructuredTasteProfile = {
      genres,
      moods,
      contexts,
      vibe,
      recommendationStyle,
      energy,
      discoveryOpenness,
      otherGenres: otherGenreInput
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
        .slice(0, 3),
      favoriteArtists: splitArtistInput(artistsInput),
    };
    const legacy = mapStructuredToLegacy(structured);

    return {
      ...legacy,
      completedAt: new Date().toISOString(),
      skipped: false,
      structured,
    };
  }, [artistsInput, contexts, discoveryOpenness, energy, genres, moods, otherGenreInput, recommendationStyle, vibe]);

  const completedSections = [
    genres.length > 0,
    moods.length > 0,
    contexts.length > 0,
    recommendationStyle.length > 0,
    energy.length > 0,
    discoveryOpenness.length > 0,
    vibe.length > 0,
  ].filter(Boolean).length;

  function finish(skip = false) {
    completeOnboarding(
      skip
        ? {
            genres: [],
            artists: [],
            moods: [],
            goals: [],
            structured: {
              genres: [],
              moods: [],
              contexts: [],
              vibe: "Chill",
              recommendationStyle: "balanced",
              energy: "mixed",
              discoveryOpenness: "medium",
              otherGenres: [],
              favoriteArtists: [],
            },
            completedAt: new Date().toISOString(),
            skipped: true,
          }
        : profile,
    );
    router.replace("/");
  }

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-74px)] w-full max-w-3xl items-start px-4 py-6 sm:items-center sm:py-8">
      <section className="w-full rounded-3xl border border-[var(--panel-border)] bg-[var(--panel-surface)] p-4 shadow-[0_22px_52px_rgba(var(--accent-rgb),0.12)] sm:p-7">
        <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--text)]">
          <Sparkles className="h-3.5 w-3.5 text-[var(--accent)]" /> {copy.starterTitle}
        </p>
        <h1 className="text-2xl font-semibold text-[var(--text)]">{t("onboarding_title", language)}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">{t("onboarding_desc", language)}</p>
        <p className="mt-1 text-xs text-[var(--muted)]">{copy.helper}</p>
        <div className="mt-3 flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-2 text-xs text-[var(--muted)]">
          <span>{copy.progress}: {completedSections}/7</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--border)]">
            <div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${(completedSections / 7) * 100}%` }} />
          </div>
          <span>{copy.selected}</span>
        </div>

        <div className="mt-5 space-y-4">
          <div className="rounded-2xl border border-[var(--accent-border)] bg-[var(--surface-tinted)] px-3 py-2 text-xs text-[var(--muted)]">
            {copy.editable}
          </div>
          <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface-subtle)] p-3 sm:p-4">
            <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--text)]"><Music className="h-4 w-4 text-[var(--accent)]" /> {t("onboarding_genres", language)}</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">{copy.genresHelp}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {GENRE_OPTIONS.map((option) => (
                <OptionChip key={option} active={genres.includes(option)} label={option} onClick={() => setGenres((prev) => toggleValue(prev, option, 6))} />
              ))}
            </div>
            <label className="mt-3 block text-xs text-[var(--muted)]">
              {copy.optionalOtherGenre}
              <input
                className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                value={otherGenreInput}
                placeholder={copy.otherGenrePlaceholder}
                onChange={(event) => setOtherGenreInput(event.target.value)}
              />
            </label>
          </section>

          <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface-subtle)] p-3 sm:p-4">
            <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--text)]"><Radio className="h-4 w-4 text-[var(--accent)]" /> {t("onboarding_moods", language)}</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">{copy.moodsHelp}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {MOOD_OPTIONS.map((option) => (
                <OptionChip key={option} active={moods.includes(option)} label={option} onClick={() => setMoods((prev) => toggleValue(prev, option, 6))} />
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface-subtle)] p-3 sm:p-4">
            <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--text)]"><TrendingUp className="h-4 w-4 text-[var(--accent)]" /> {t("onboarding_goals", language)}</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">{copy.contextsHelp}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {CONTEXT_OPTIONS.map((option) => (
                <OptionChip key={option} active={contexts.includes(option)} label={option} onClick={() => setContexts((prev) => toggleValue(prev, option, 6))} />
              ))}
            </div>
          </section>

          <section className="grid gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-subtle)] p-3 sm:p-4 lg:grid-cols-2">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{copy.recommendationStyle}</h3>
              <p className="mt-1 text-xs text-[var(--muted)]">{copy.recommendationHelp}</p>
              <div className="mt-2 space-y-2">
                <ChoiceCard title={copy.mostlyFamiliar} active={recommendationStyle === "familiar"} onClick={() => setRecommendationStyle("familiar")} />
                <ChoiceCard title={copy.balanced} active={recommendationStyle === "balanced"} onClick={() => setRecommendationStyle("balanced")} />
                <ChoiceCard title={copy.mostlyDiscovery} active={recommendationStyle === "discovery"} onClick={() => setRecommendationStyle("discovery")} />
              </div>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{copy.energy}</h3>
              <p className="mt-1 text-xs text-[var(--muted)]">{copy.energyHelp}</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {ENERGY_OPTIONS.map((option) => {
                  const title = option === "low" ? copy.low : option === "medium" ? copy.medium : option === "high" ? copy.high : copy.mixed;
                  return <ChoiceCard key={option} title={title} active={energy === option} onClick={() => setEnergy(option)} />;
                })}
              </div>
              <h3 className="mt-3 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{copy.discovery}</h3>
              <p className="mt-1 text-xs text-[var(--muted)]">{copy.discoveryHelp}</p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {DISCOVERY_OPENNESS_OPTIONS.map((option) => {
                  const title = option === "low" ? copy.low : option === "medium" ? copy.medium : copy.high;
                  return <ChoiceCard key={option} title={title} active={discoveryOpenness === option} onClick={() => setDiscoveryOpenness(option)} />;
                })}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface-subtle)] p-3 sm:p-4">
            <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--text)]"><Zap className="h-4 w-4 text-[var(--accent)]" /> {copy.vibe}</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">{copy.vibeHelp}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {VIBE_OPTIONS.map((option) => (
                <OptionChip key={option} active={vibe === option} label={option} onClick={() => setVibe(option)} />
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-3 sm:p-4">
            <h2 className="text-sm font-semibold text-[var(--text)]">{copy.optionalArtists}</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">{copy.optionalArtistsHelp}</p>
            <input
              className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              value={artistsInput}
              placeholder={copy.artistsPlaceholder}
              onChange={(event) => setArtistsInput(event.target.value)}
            />
          </section>
        </div>

        <div className="sticky bottom-2 mt-6 flex flex-col-reverse gap-2 rounded-2xl border border-[var(--border)] bg-[color:color-mix(in_srgb,var(--panel-surface)_88%,transparent)] p-2 backdrop-blur sm:static sm:flex-row sm:justify-end sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-0">
          <button type="button" className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--muted)] hover:bg-[var(--hover-bg)]" onClick={() => finish(true)}>
            {t("onboarding_skip", language)}
          </button>
          <button type="button" className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-foreground)] shadow-[0_10px_24px_rgba(var(--accent-rgb),0.26)] hover:opacity-90" onClick={() => finish(false)}>
            {t("onboarding_save", language)}
          </button>
        </div>
      </section>
    </main>
  );
}
