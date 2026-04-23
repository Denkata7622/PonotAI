'use client';

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Clock, Library, Settings, Sparkles, TrendingUp } from "../../lucide-react";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import { useUser } from "../context/UserContext";
import { useTheme } from "../../lib/ThemeContext";
import { readTasteProfile } from "../features/onboarding/tasteProfile";
import { scopedKey, useProfile } from "../../lib/ProfileContext";
import { apiFetch } from "../lib/apiFetch";

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

type ThemeStudioSlotState = "active" | "available" | "bonus-locked" | "reserved";

type ThemeStudioSlot = {
  id: number;
  title: string;
  state: ThemeStudioSlotState;
  subtitle: string;
  details: string;
  cta?: {
    label: string;
    href: string;
  };
};

type MusicPackState = "no-pack-yet" | "available-generated" | "limited-generated" | "future-cadence-locked";

type MusicPackCard = {
  id: string;
  title: string;
  cadenceLabel: string;
  packSizeLabel: string;
  identityLabel: string;
  state: MusicPackState;
  description: string;
  note?: string;
  ctaLabel?: string;
  ctaDisabled?: boolean;
  ctaMode?: "open" | "passive";
};

type GeneratedMusicPackResponse = {
  status: "available" | "limited" | "insufficient_data";
  message: string;
  generatedAt: string;
  pack: null | {
    id: string;
    title: string;
    subtitle: string;
    moodLabel: string;
    songCount: number;
    tracks: Array<{
      rank: number;
      trackKey: string;
      title: string;
      artist: string;
      album?: string;
      coverUrl?: string;
      reason: string;
      reasonSignals?: string[];
    }>;
    explanation: {
      summary: string;
      basis: string[];
    };
  };
};

type TasteIdentitySummaryResponse = {
  generatedAt: string;
  sparseState: "sparse" | "growing" | "rich";
  coreIdentity: string;
  currentDirection: string;
  anchors: string[];
  evidence: string[];
  confidenceNote: string;
  foundation: {
    ultraLikedCount: number;
    favoritesCount: number;
    recurringArtists: string[];
    recentHistoryEvents14d: number;
    onboardingSeedCount: number;
    tasteIdentityConfidence: "low" | "medium" | "high";
  };
};

export default function PersonalizationPage() {
  const { user, favorites, history, isAuthenticated, updateProfile } = useUser();
  const { profile } = useProfile();
  const { theme, accent, intensity, surfaceStyle, density } = useTheme();
  const [playlistCount, setPlaylistCount] = useState(0);
  const [generatedPack, setGeneratedPack] = useState<GeneratedMusicPackResponse | null>(null);
  const [musicPackLoading, setMusicPackLoading] = useState(false);
  const [packModalOpen, setPackModalOpen] = useState(false);
  const [packSaving, setPackSaving] = useState(false);
  const [packNotice, setPackNotice] = useState<string | null>(null);
  const [discardedPackId, setDiscardedPackId] = useState<string | null>(null);
  const [selectedTrackKeys, setSelectedTrackKeys] = useState<string[]>([]);
  const [tasteIdentitySummary, setTasteIdentitySummary] = useState<TasteIdentitySummaryResponse | null>(null);

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
  const sparseData = history.length < 5 && favorites.length < 3;
  const fallbackTasteSummary = useMemo(() => {
    const coreIdentity = topGenres.length
      ? `Your core taste currently centers on ${topGenres.slice(0, 2).join(" and ")}${topMoods.length ? ` with a ${topMoods[0].toLowerCase()} lane` : ""}.`
      : "Your core taste is still learning from onboarding and first saves.";
    const currentDirection = recentHistoryCount >= 4
      ? "Current direction: your recent listening is active and helps refine short-term direction."
      : "Current direction: recent behavior is still light, so this mostly reflects your early signals.";
    const anchors = [
      `Ultra-like anchors: ${favorites.filter((item) => item.ultraLiked).length || "forming"}`,
      favorites.length ? `Favorites signal: ${favorites.length} saved` : "Favorites signal is still light",
      topArtists.length ? `Recurring artists: ${topArtists.join(" · ")}` : "Recurring artists are still forming",
      recentHistoryCount > 0 ? `Recent direction: ${recentHistoryCount} listens in 14 days` : "Recent direction signal is not active yet",
      sparseData ? "Onboarding support is active while your profile is still early" : "Onboarding influence is now secondary to behavior",
    ];
    const evidence = [
      `Grounded by favorites (${favorites.length}), listening history (${history.length}), and playlists (${playlistCount}).`,
    ];
    return { coreIdentity, currentDirection, anchors, evidence };
  }, [favorites, history.length, playlistCount, recentHistoryCount, sparseData, topArtists, topGenres, topMoods]);

  const recommendationDataSharingEnabled = Boolean(user?.recommendationDataSharingEnabled);
  const recommendationMode = user?.recommendationMode ?? "balanced";
  const repeatedArtistTolerance = user?.repeatedArtistTolerance ?? "normal";
  const energyPreference = user?.energyPreference ?? "mixed";
  const recommendationModeLabel = recommendationMode === "safe_familiar"
    ? "Safe & familiar"
    : recommendationMode === "mostly_discovery"
      ? "Mostly discovery"
      : "Balanced";
  const currentThemeSummary = `${theme} · ${accent} · ${surfaceStyle}`;
  const themeStudioSlots = useMemo<ThemeStudioSlot[]>(() => ([
    {
      id: 1,
      title: "Slot 1",
      state: "active",
      subtitle: "Active free slot",
      details: `Current setup is applied here (${currentThemeSummary}).`,
      cta: { label: "Open Theme Studio", href: "/theme-studio" },
    },
    {
      id: 2,
      title: "Slot 2",
      state: "available",
      subtitle: "Free slot",
      details: "Available for your next saved theme profile once Theme Studio editing ships.",
    },
    recommendationDataSharingEnabled
      ? {
        id: 3,
        title: "Slot 3",
        state: "available",
        subtitle: "Bonus slot ready",
        details: "Recommendation data sharing is enabled, so this bonus slot is available.",
      }
      : {
        id: 3,
        title: "Slot 3",
        state: "bonus-locked",
        subtitle: "Bonus slot paused",
        details: "Enable recommendation data sharing to activate this bonus slot.",
        cta: { label: "Enable in settings", href: "/settings#recommendation-data-sharing" },
      },
    {
      id: 4,
      title: "Slot 4",
      state: "reserved",
      subtitle: "Reserved roadmap slot",
      details: "Held for a later beta expansion. No premium or purchase flow is active today.",
    },
  ]), [accent, currentThemeSummary, recommendationDataSharingEnabled, surfaceStyle, theme]);

  const musicPackCards = useMemo<MusicPackCard[]>(() => {
    const primaryMood = topMoods[0] ?? "Adaptive";
    const primaryGenre = topGenres[0] ?? "Cross-genre";
    const featured: MusicPackCard = !isAuthenticated
      ? {
        id: "featured-sign-in",
        title: "First Identity Drop",
        cadenceLabel: "Weekly free drop",
        packSizeLabel: "Sign in required",
        identityLabel: `${primaryMood} · ${primaryGenre}`,
        state: "no-pack-yet",
        description: "Sign in to generate your first real Music Pack from your ultra-likes, favorites, and listening behavior.",
        note: "Pack generation uses your recommendation controls and onboarding profile where available.",
        ctaLabel: "Sign in to generate",
        ctaDisabled: true,
      }
      : musicPackLoading
        ? {
          id: "featured-loading",
          title: "Generating your first pack",
          cadenceLabel: "Weekly free drop",
          packSizeLabel: "In progress",
          identityLabel: `${primaryMood} · ${primaryGenre}`,
          state: "no-pack-yet",
          description: "Building a real drop from your strongest signals (ultra-like, favorites, recent behavior, and onboarding fallback).",
          note: `Current recommendation mode: ${recommendationModeLabel}.`,
          ctaLabel: "Generating…",
          ctaDisabled: true,
        }
        : generatedPack?.pack
          ? {
            id: generatedPack.pack.id,
            title: generatedPack.pack.title,
            cadenceLabel: "Weekly free drop",
            packSizeLabel: `${generatedPack.pack.songCount} songs`,
            identityLabel: generatedPack.pack.moodLabel,
            state: generatedPack.status === "limited" ? "limited-generated" : "available-generated",
            description: generatedPack.pack.subtitle,
            note: `${generatedPack.pack.explanation.summary} ${generatedPack.pack.tracks.slice(0, 2).map((track) => `${track.title} — ${track.artist}`).join(" · ")}`,
            ctaLabel: "Open pack",
            ctaDisabled: false,
            ctaMode: "open",
          }
          : {
            id: "featured-learning",
            title: "First Identity Drop",
            cadenceLabel: "Weekly free drop",
            packSizeLabel: sparseData ? "Early signal" : "Insufficient data",
            identityLabel: `${primaryMood} · ${primaryGenre}`,
            state: "no-pack-yet",
            description: "Not enough usable data yet for an honest full pack. Keep listening or add favorites and ultra-likes.",
            note: recommendationDataSharingEnabled
              ? "Recommendation data sharing is enabled; generation depth will improve as your listening data grows."
              : "Enable recommendation data sharing for stronger pack shaping and faster confidence.",
            ctaLabel: "Preparing",
            ctaDisabled: true,
          };

    const nextDrop: MusicPackCard = {
      id: "next-drop",
      title: "Next Drop Slot",
      cadenceLabel: "Next weekly slot",
      packSizeLabel: "Pending",
      identityLabel: "Cadence placeholder",
      state: "future-cadence-locked",
      description: "Next pack appears on the free weekly cadence once generation is active.",
      note: "Later roadmap includes more frequent cadence for eligible plans. No billing or upgrade flow is active today.",
      ctaLabel: "Locked for later cadence",
      ctaDisabled: true,
      ctaMode: "passive",
    };

    return [featured, nextDrop];
  }, [generatedPack, isAuthenticated, musicPackLoading, recommendationDataSharingEnabled, recommendationModeLabel, sparseData, topGenres, topMoods]);

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const dismissed = window.localStorage.getItem(scopedKey("ponotai.music-packs.featured.discarded", profile.id));
      setDiscardedPackId(dismissed && dismissed.trim() ? dismissed : null);
    } catch {
      setDiscardedPackId(null);
    }
  }, [profile.id]);

  async function loadFeaturedPack() {
    if (!isAuthenticated) return;
    const onboardingSeed = {
      genres: topGenres.slice(0, 8),
      moods: topMoods.slice(0, 8),
      contexts: topContexts.slice(0, 8),
      favoriteArtists: topArtists.slice(0, 8),
    };
    setPackNotice(null);
    setMusicPackLoading(true);
    try {
      const response = await apiFetch("/api/ai/music-packs/featured", {
        method: "POST",
        body: JSON.stringify({ onboardingSeed }),
      });
      if (!response.ok) throw new Error(`Music pack generation failed (${response.status})`);
      const payload = await response.json() as GeneratedMusicPackResponse;
      setGeneratedPack(payload);
    } catch {
      setGeneratedPack(null);
      setPackNotice("Could not generate a featured pack right now.");
    } finally {
      setMusicPackLoading(false);
    }
  }

  useEffect(() => {
    if (!isAuthenticated) {
      setGeneratedPack(null);
      return;
    }

    let cancelled = false;
    async function loadPack() {
      if (cancelled) return;
      await loadFeaturedPack();
    }

    void loadPack();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, topArtists, topContexts, topGenres, topMoods]);

  useEffect(() => {
    if (!isAuthenticated) {
      setTasteIdentitySummary(null);
      return;
    }
    let cancelled = false;
    async function loadTasteIdentity() {
      const onboardingSeed = {
        genres: topGenres.slice(0, 8),
        moods: topMoods.slice(0, 8),
        contexts: topContexts.slice(0, 8),
        favoriteArtists: topArtists.slice(0, 8),
      };
      try {
        const response = await apiFetch("/api/ai/taste-identity/summary", {
          method: "POST",
          body: JSON.stringify({ onboardingSeed }),
        });
        if (!response.ok) throw new Error(`Taste identity summary failed (${response.status})`);
        const payload = await response.json() as TasteIdentitySummaryResponse;
        if (!cancelled) setTasteIdentitySummary(payload);
      } catch {
        if (!cancelled) setTasteIdentitySummary(null);
      }
    }
    void loadTasteIdentity();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, topArtists, topContexts, topGenres, topMoods]);

  const featuredPackHiddenByDiscard = Boolean(generatedPack?.pack?.id && discardedPackId === generatedPack.pack.id);
  const allTrackKeys = generatedPack?.pack?.tracks.map((track) => track.trackKey) ?? [];
  const selectedCount = selectedTrackKeys.length;
  const allSelected = allTrackKeys.length > 0 && selectedCount === allTrackKeys.length;

  useEffect(() => {
    if (!generatedPack?.pack) {
      setSelectedTrackKeys([]);
      return;
    }
    setSelectedTrackKeys(generatedPack.pack.tracks.map((track) => track.trackKey));
  }, [generatedPack?.pack?.id]);

  async function handleRecommendationDataSharingToggle() {
    if (!isAuthenticated) return;
    await updateProfile({ recommendationDataSharingEnabled: !recommendationDataSharingEnabled });
  }

  async function handleRecommendationControlChange(
    field: "recommendationMode" | "repeatedArtistTolerance" | "energyPreference",
    value: "safe_familiar" | "balanced" | "mostly_discovery" | "lower" | "normal" | "higher" | "calmer" | "mixed" | "more_energetic",
  ) {
    if (!isAuthenticated) return;
    await updateProfile({ [field]: value });
  }

  async function handleSaveFeaturedPack(mode: "all" | "selected") {
    if (!generatedPack?.pack || !isAuthenticated) return;
    const keysToSave = mode === "all" ? allTrackKeys : selectedTrackKeys;
    if (keysToSave.length === 0) return;
    setPackSaving(true);
    setPackNotice(null);
    try {
      const response = await apiFetch("/api/ai/music-packs/featured/save", {
        method: "POST",
        body: JSON.stringify({
          packId: generatedPack.pack.id,
          title: generatedPack.pack.title,
          tracks: generatedPack.pack.tracks.map((track) => ({
            trackKey: track.trackKey,
            title: track.title,
            artist: track.artist,
            album: track.album,
            coverUrl: track.coverUrl,
          })),
          selectedTrackKeys: keysToSave,
        }),
      });
      if (!response.ok) throw new Error(`Music pack save failed (${response.status})`);
      const payload = await response.json() as { playlist?: { id?: string }; savedTracks?: number };
      setPackNotice(`Saved this pack as a playlist (${payload.savedTracks ?? keysToSave.length} tracks).`);
      setPackModalOpen(false);
      setPlaylistCount((value) => value + 1);
    } catch {
      setPackNotice("Could not save this pack right now.");
    } finally {
      setPackSaving(false);
    }
  }

  function handleDiscardFeaturedPack() {
    if (!generatedPack?.pack) return;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(scopedKey("ponotai.music-packs.featured.discarded", profile.id), generatedPack.pack.id);
    }
    setDiscardedPackId(generatedPack.pack.id);
    setPackModalOpen(false);
    setPackNotice("Pack discarded for now. You can generate again any time.");
  }

  function handleBringBackPack() {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(scopedKey("ponotai.music-packs.featured.discarded", profile.id));
    }
    setDiscardedPackId(null);
    setPackNotice("Discard was cleared. Open the pack to inspect it again.");
  }

  function handleTrackSelectionToggle(trackKey: string) {
    setSelectedTrackKeys((current) => (
      current.includes(trackKey)
        ? current.filter((item) => item !== trackKey)
        : [...current, trackKey]
    ));
  }

  function handleSelectAllTracks() {
    setSelectedTrackKeys(allTrackKeys);
  }

  function handleClearTrackSelection() {
    setSelectedTrackKeys([]);
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-3 pb-[calc(var(--layout-bottom-offset)+24px)] pt-2 sm:px-6 sm:pt-4">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Personalization hub</p>
        <h1 className="display-styled text-3xl font-semibold tracking-tight sm:text-4xl">Personalization</h1>
        <p className="max-w-3xl text-sm text-[var(--muted)]">
          This is your control center for identity, style, future rewards, and recommendation behavior.
          Some blocks are live today and some are intentionally scaffolded for upcoming roadmap passes.
        </p>
      </header>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card variant="settings" className="order-2 space-y-4 p-4 sm:p-5 lg:order-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">Taste Identity</p>
              <h2 className="text-xl font-semibold">Your listening fingerprint</h2>
            </div>
            <Sparkles className="h-5 w-5 text-[var(--accent)]" />
          </div>
          <p className="text-sm text-[var(--muted)]">A weighted, grounded read of your core taste and current listening direction.</p>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-surface)] p-4">
            <p className="text-sm font-medium">{tasteIdentitySummary?.coreIdentity ?? fallbackTasteSummary.coreIdentity}</p>
            <p className="mt-2 text-xs text-[var(--muted)]">{tasteIdentitySummary?.currentDirection ?? fallbackTasteSummary.currentDirection}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(tasteIdentitySummary?.anchors ?? fallbackTasteSummary.anchors).slice(0, 5).map((anchor) => (
              <span key={anchor} className="rounded-full border border-[var(--border)] bg-[var(--panel-surface)] px-2.5 py-1 text-xs">
                {anchor}
              </span>
            ))}
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-surface)] p-3 text-xs text-[var(--muted)]">
            <p className="font-medium text-[var(--text)]">Evidence</p>
            <ul className="mt-1 space-y-1">
              {(tasteIdentitySummary?.evidence ?? fallbackTasteSummary.evidence).slice(0, 3).map((line) => (
                <li key={line}>• {line}</li>
              ))}
            </ul>
            {tasteIdentitySummary?.confidenceNote ? <p className="mt-2">{tasteIdentitySummary.confidenceNote}</p> : null}
            {!tasteIdentitySummary && sparseData ? <p className="mt-2">Still learning: onboarding and first saves are currently stronger than behavior history.</p> : null}
          </div>
          <div className="rounded-xl border border-dashed border-[var(--border)] p-3 text-xs text-[var(--muted)]">
            Signal scope stays curated on purpose. Turrex reads weighted signals without exposing raw model weights.
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-surface)] p-3 text-xs text-[var(--muted)]">
            <p>
              Sharing preference is currently {recommendationDataSharingEnabled ? "enabled" : "disabled"} and supports recommendation quality, but it is not treated as a taste trait.
            </p>
          </div>
        </Card>

        <Card variant="settings" className="order-1 space-y-4 p-4 sm:p-5 lg:order-1 lg:col-span-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">Theme Studio Preview</p>
              <h2 className="text-xl font-semibold">Look and feel direction</h2>
            </div>
            <Sparkles className="h-5 w-5 text-[var(--accent)]" />
          </div>
          <p className="text-sm text-[var(--muted)]">
            Preview your active visual setup and jump into Theme Studio for real temporary preview sessions.
          </p>
          <div className="rounded-2xl border border-[var(--accent-border)] bg-[var(--accent-soft)] p-3.5 sm:p-4">
            <p className="text-xs uppercase tracking-[0.1em] text-[var(--muted)]">Current style snapshot</p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              {[`Theme: ${theme}`, `Accent: ${accent}`, `Intensity: ${intensity}`, `Surface: ${surfaceStyle}`, `Density: ${density}`].map((chip) => (
                <span key={chip} className="rounded-full border border-[var(--border)] bg-[var(--panel-surface)] px-2.5 py-1 break-words">{chip}</span>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {themeStudioSlots.map((slot) => {
                const stateClassName = slot.state === "active"
                  ? "border-[var(--accent-border)] bg-[var(--panel-surface)]"
                  : slot.state === "available"
                    ? "border-[var(--border)] bg-[var(--panel-surface)]"
                    : slot.state === "bonus-locked"
                      ? "border-[var(--border)] bg-[var(--surface-subtle)]/70"
                      : "border-[var(--border)] bg-black/35";
                return (
                  <div key={slot.id} className={`rounded-xl border p-3.5 ${stateClassName}`}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{slot.title}</p>
                      {slot.state === "active" ? <span className="rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] uppercase tracking-[0.08em]">Live</span> : null}
                      {slot.state === "bonus-locked" ? <Sparkles className="h-4 w-4 text-[var(--muted)]" /> : null}
                    </div>
                    <p className="mt-1 text-xs font-medium text-[var(--muted)]">{slot.subtitle}</p>
                    <p className="mt-2 break-words text-xs text-[var(--muted)]">{slot.details}</p>
                    {slot.cta ? (
                      <div className="mt-3">
                        <Link href={slot.cta.href}>
                          <Button variant="ghost" size="sm">
                            <span className="inline-flex items-center gap-1.5">{slot.cta.label}<ChevronRight className="h-3.5 w-3.5" /></span>
                          </Button>
                        </Link>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/theme-studio"><Button variant="primary" size="sm"><span className="inline-flex items-center gap-2"><Sparkles className="h-4 w-4" />Open Theme Studio</span></Button></Link>
              <Link href="/settings#appearance"><Button variant="secondary" size="sm"><span className="inline-flex items-center gap-2"><TrendingUp className="h-4 w-4" />Open current theme controls</span></Button></Link>
            </div>
          </div>
        </Card>

        <Card variant="settings" className="order-4 space-y-4 p-4 sm:p-5 lg:order-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">Personalized Music Packs</p>
              <h2 className="text-xl font-semibold">Collectible recommendation drops</h2>
            </div>
            <Library className="h-5 w-5 text-[var(--accent)]" />
          </div>
          <p className="text-sm text-[var(--muted)]">
            Music Packs are structured as collectible song drops, not generic playlists. This block now generates one real featured pack from weighted identity, behavior, and intent signals.
          </p>
          <div className="rounded-2xl border border-[var(--accent-border)] bg-[var(--accent-soft)] p-4">
            <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.08em] text-[var(--muted)]">
              <span className="rounded-full border border-[var(--border)] bg-[var(--panel-surface)] px-2.5 py-1">Free cadence: weekly</span>
              <span className="rounded-full border border-[var(--border)] bg-[var(--panel-surface)] px-2.5 py-1">Pack mode: collectible drops</span>
              <span className="rounded-full border border-[var(--border)] bg-[var(--panel-surface)] px-2.5 py-1">{`Signal mode: ${recommendationModeLabel}`}</span>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {musicPackCards.filter((pack) => !(pack.state.includes("generated") && featuredPackHiddenByDiscard)).map((pack) => {
                const cardClassName = pack.state === "available-generated"
                  ? "border-[var(--accent-border)] bg-[var(--panel-surface)]"
                  : pack.state === "limited-generated"
                    ? "border-[var(--accent-border)] bg-[var(--panel-surface)]/80"
                  : pack.state === "future-cadence-locked"
                    ? "border-[var(--border)] bg-black/30"
                    : "border-[var(--border)] bg-[var(--panel-surface)]";
                return (
                  <div key={pack.id} className={`rounded-xl border p-3 ${cardClassName}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold">{pack.title}</p>
                        <p className="text-[11px] text-[var(--muted)]">{pack.cadenceLabel}</p>
                      </div>
                      {pack.state === "future-cadence-locked" ? <Clock className="mt-0.5 h-4 w-4 text-[var(--muted)]" /> : null}
                      {pack.state === "available-generated" ? <span className="rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] uppercase tracking-[0.08em]">Generated</span> : null}
                      {pack.state === "limited-generated" ? <span className="rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] uppercase tracking-[0.08em]">Generated · Limited</span> : null}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)]/60 p-2">
                        <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">Pack size</p>
                        <p className="mt-0.5 font-medium">{pack.packSizeLabel}</p>
                      </div>
                      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)]/60 p-2">
                        <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">Identity lane</p>
                        <p className="mt-0.5 font-medium">{pack.identityLabel}</p>
                      </div>
                    </div>
                    <p className="mt-3 break-words text-xs text-[var(--muted)]">{pack.description}</p>
                    {pack.note ? <p className="mt-1 text-[11px] text-[var(--muted)]">{pack.note}</p> : null}
                    {pack.ctaLabel ? (
                      <button
                        type="button"
                        onClick={pack.ctaMode === "open" ? () => setPackModalOpen(true) : undefined}
                        disabled={pack.ctaDisabled}
                        className="mt-3 rounded-full border border-[var(--border)] bg-transparent px-3 py-1 text-xs font-medium text-[var(--muted)] disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {pack.ctaLabel}
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {featuredPackHiddenByDiscard ? (
              <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--panel-surface)] p-3">
                <p className="text-sm font-medium">Featured pack discarded</p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Discard hides the current generated pack for now. No long-term archive or cadence skip is applied in this pass.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="ghost" size="sm" onClick={handleBringBackPack}>Bring back pack</Button>
                  <Button variant="secondary" size="sm" onClick={() => void loadFeaturedPack()}>Generate again</Button>
                </div>
              </div>
            ) : null}
            {packNotice ? <p className="mt-3 text-xs text-[var(--muted)]">{packNotice}</p> : null}
          </div>
          <div className="rounded-xl border border-dashed border-[var(--border)] p-3 text-xs text-[var(--muted)]">
            This pass keeps the flow intentionally small: open and inspect the generated pack, save it as a playlist, or discard it from the current featured slot.
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {[
              "Open pack reveal flow",
              "Save pack to library",
              "Discard and refresh slot",
              "Preview top song moments",
            ].map((step) => (
              <div key={step} className="rounded-lg border border-[var(--border)] bg-[var(--panel-surface)] p-3">
                <p className="text-sm font-medium">{step}</p>
                <p className="text-xs text-[var(--muted)]">Roadmap boundary prepared</p>
              </div>
            ))}
          </div>
        </Card>

        <Card variant="settings" className="order-3 space-y-4 p-4 sm:p-5 lg:order-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">Recommendation Controls</p>
              <h2 className="text-xl font-semibold">How Turrex tunes suggestions</h2>
            </div>
            <Settings className="h-5 w-5 text-[var(--accent)]" />
          </div>
          <p className="text-sm text-[var(--muted)]">
            Set how familiar vs discovery-forward suggestions should feel. These controls are active now and will be reused by discovery and assistant flows in later passes.
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
                className={`rounded-full border px-3 py-2 text-xs font-medium transition ${recommendationDataSharingEnabled ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--text)]" : "border-[var(--border)] bg-transparent text-[var(--muted)]"} disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {recommendationDataSharingEnabled ? "Enabled" : "Disabled"}
              </button>
            </div>
            {!isAuthenticated ? <p className="mt-2 text-xs text-[var(--muted)]">Sign in to change this preference.</p> : null}
          </div>
          <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--panel-surface)] p-4">
            {[
              {
                key: "recommendationMode" as const,
                label: "Recommendation mode",
                description: "Controls how often Turrex should prioritize new discoveries.",
                options: [
                  { value: "safe_familiar", label: "Safe & familiar" },
                  { value: "balanced", label: "Balanced" },
                  { value: "mostly_discovery", label: "Mostly discovery" },
                ],
                active: recommendationMode,
              },
              {
                key: "repeatedArtistTolerance" as const,
                label: "Repeated artist tolerance",
                description: "Choose how often recommendations can repeat artists you already like.",
                options: [
                  { value: "lower", label: "Lower" },
                  { value: "normal", label: "Normal" },
                  { value: "higher", label: "Higher" },
                ],
                active: repeatedArtistTolerance,
              },
              {
                key: "energyPreference" as const,
                label: "Energy preference",
                description: "Steer overall recommendation energy level.",
                options: [
                  { value: "calmer", label: "Calmer" },
                  { value: "mixed", label: "Mixed" },
                  { value: "more_energetic", label: "More energetic" },
                ],
                active: energyPreference,
              },
            ].map((control) => (
              <div key={control.key}>
                <p className="text-sm font-medium">{control.label}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">{control.description}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {control.options.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => void handleRecommendationControlChange(control.key, option.value as "safe_familiar" | "balanced" | "mostly_discovery" | "lower" | "normal" | "higher" | "calmer" | "mixed" | "more_energetic")}
                      disabled={!isAuthenticated || control.active === option.value}
                      className={`rounded-full border px-3 py-2 text-xs font-medium transition ${
                        control.active === option.value
                          ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--text)]"
                          : "border-[var(--border)] bg-transparent text-[var(--muted)] hover:border-[var(--accent-border)] hover:text-[var(--text)]"
                      } disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {!isAuthenticated ? <p className="text-xs text-[var(--muted)]">Sign in to change recommendation controls.</p> : null}
          </div>
          <div className="rounded-xl border border-dashed border-[var(--border)] p-3 text-xs text-[var(--muted)]">
            These controls are persisted now and intentionally compact. Advanced tuning remains roadmap work.
          </div>
        </Card>
      </section>
      {generatedPack?.pack ? (
        <Modal
          isOpen={packModalOpen}
          onClose={() => setPackModalOpen(false)}
          title={generatedPack.pack.title}
          maxWidth="760px"
          panelClassName="space-y-4"
        >
          <div className="rounded-xl border border-[var(--accent-border)] bg-[var(--accent-soft)] p-3">
            <p className="text-xs uppercase tracking-[0.08em] text-[var(--muted)]">{generatedPack.pack.moodLabel}</p>
            <p className="mt-1 text-sm font-medium">{generatedPack.pack.subtitle}</p>
            <p className="mt-2 text-xs text-[var(--muted)]">{generatedPack.pack.explanation.summary}</p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--panel-surface)] px-3 py-2">
              <p className="text-xs text-[var(--muted)]">{selectedCount} of {allTrackKeys.length} tracks selected</p>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={handleSelectAllTracks} disabled={allSelected}>Select all</Button>
                <Button variant="ghost" size="sm" onClick={handleClearTrackSelection} disabled={selectedCount === 0}>Clear</Button>
              </div>
            </div>
            {generatedPack.pack.tracks.map((track) => (
              <div key={track.trackKey} className="rounded-xl border border-[var(--border)] bg-[var(--panel-surface)] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={selectedTrackKeys.includes(track.trackKey)}
                      onChange={() => handleTrackSelectionToggle(track.trackKey)}
                      className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
                    />
                    <div>
                      <p className="text-sm font-medium">{track.rank}. {track.title}</p>
                      <p className="text-xs text-[var(--muted)]">{track.artist}</p>
                    </div>
                  </div>
                  <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">Track {track.rank}</span>
                </div>
                <p className="mt-2 text-xs text-[var(--muted)]">{track.reason}</p>
                {track.reasonSignals && track.reasonSignals.length > 1 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {track.reasonSignals.slice(1).map((signal) => (
                      <span key={signal} className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] text-[var(--muted)]">
                        {signal}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          {selectedCount === 0 ? <p className="text-xs text-amber-300">Select at least one track to save this pack.</p> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={handleDiscardFeaturedPack}>Discard pack</Button>
            <Button variant="secondary" size="sm" disabled={packSaving || allTrackKeys.length === 0} onClick={() => void handleSaveFeaturedPack("all")}>
              {packSaving ? "Saving…" : "Save full pack"}
            </Button>
            <Button variant="primary" size="sm" disabled={packSaving || selectedCount === 0} onClick={() => void handleSaveFeaturedPack("selected")}>
              {packSaving ? "Saving…" : `Save selected (${selectedCount})`}
            </Button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
