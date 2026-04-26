'use client';

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Clock, Library, Sparkles, TrendingUp } from "../../lucide-react";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import { usePlayer } from "../../components/PlayerProvider";
import { useUser } from "../context/UserContext";
import { useTheme } from "../../lib/ThemeContext";
import { formatUtcDate, formatUtcDateTime } from "../../lib/dateFormat";
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
      reasonSignals?: string[];
      stateNote?: string;
      basis: string[];
    };
  };
};

type GeneratedPackTrack = NonNullable<GeneratedMusicPackResponse["pack"]>["tracks"][number];

type MusicPackLifecycleRecord = {
  packId: string;
  title: string;
  status: "generated" | "saved" | "discarded";
  generatedAt: string;
  outcomeAt?: string;
  nextDropAt: string;
};

type MusicPackLifecycleResponse = {
  generatedAt: string;
  current: MusicPackLifecycleRecord | null;
  history: MusicPackLifecycleRecord[];
  nextDrop: {
    state: "current_pack_available" | "pending";
    nextDropAt: string;
    secondsUntilNextDrop: number;
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
  const { playNow, addManyToQueue } = usePlayer();
  const { user, favorites, history, isAuthenticated } = useUser();
  const { profile } = useProfile();
  const { theme, accent, intensity, surfaceStyle, density } = useTheme();
  const [playlistCount, setPlaylistCount] = useState(0);
  const [generatedPack, setGeneratedPack] = useState<GeneratedMusicPackResponse | null>(null);
  const [musicPackLoading, setMusicPackLoading] = useState(false);
  const [packModalOpen, setPackModalOpen] = useState(false);
  const [packSaving, setPackSaving] = useState(false);
  const [packNotice, setPackNotice] = useState<string | null>(null);
  const [packLifecycle, setPackLifecycle] = useState<MusicPackLifecycleResponse | null>(null);
  const [selectedTrackKeys, setSelectedTrackKeys] = useState<string[]>([]);
  const [tasteIdentitySummary, setTasteIdentitySummary] = useState<TasteIdentitySummaryResponse | null>(null);
  const [tasteIdentityNotice, setTasteIdentityNotice] = useState<string | null>(null);
  const [tasteProfile, setTasteProfile] = useState<ReturnType<typeof readTasteProfile>>(null);
  const featuredPackRequestRef = useRef<{ inFlight: boolean; hasLoaded: boolean }>({ inFlight: false, hasLoaded: false });
  const tasteSummaryRequestRef = useRef<{ inFlight: boolean; hasLoaded: boolean }>({ inFlight: false, hasLoaded: false });
  const tasteSnapshot = tasteProfile?.structured;

  const topGenres = tasteSnapshot?.genres ?? tasteProfile?.genres ?? [];
  const topMoods = tasteSnapshot?.moods ?? tasteProfile?.moods ?? [];
  const topContexts = tasteSnapshot?.contexts ?? tasteProfile?.goals ?? [];

  useEffect(() => {
    setTasteProfile(readTasteProfile());
  }, []);
  const topArtists = useMemo(
    () => getTopCounts([...favorites.map((item) => item.artist ?? ""), ...history.map((item) => item.artist ?? "")], 3),
    [favorites, history],
  );
  const onboardingSeed = useMemo(() => ({
    genres: topGenres.slice(0, 8),
    moods: topMoods.slice(0, 8),
    contexts: topContexts.slice(0, 8),
    favoriteArtists: topArtists.slice(0, 8),
  }), [topArtists.join("|"), topContexts.join("|"), topGenres.join("|"), topMoods.join("|")]);
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
            note: generatedPack.pack.explanation.reasonSignals?.length
              ? generatedPack.pack.explanation.reasonSignals.slice(0, 2).join(" · ")
              : generatedPack.pack.explanation.summary,
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

    const nextDropDateLabel = formatUtcDateTime(packLifecycle?.nextDrop?.nextDropAt);
    const nextDrop: MusicPackCard = {
      id: "next-drop",
      title: "Next Drop Slot",
      cadenceLabel: "Next weekly slot",
      packSizeLabel: packLifecycle?.nextDrop?.state === "current_pack_available" ? "Current pack active" : "Pending",
      identityLabel: nextDropDateLabel,
      state: "future-cadence-locked",
      description: packLifecycle?.nextDrop?.state === "current_pack_available"
        ? "You currently have an active featured pack. Next drop unlocks on weekly cadence."
        : "No active featured pack right now. Next drop remains on weekly cadence.",
      note: "Next-drop timing is computed from your latest generated pack lifecycle.",
      ctaLabel: "Cadence tracked",
      ctaDisabled: true,
      ctaMode: "passive",
    };

    return [featured, nextDrop];
  }, [generatedPack, isAuthenticated, musicPackLoading, packLifecycle, recommendationDataSharingEnabled, recommendationModeLabel, sparseData, topGenres, topMoods]);

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

  const loadPackLifecycle = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const response = await apiFetch("/api/ai/music-packs/featured/lifecycle");
      if (!response.ok) throw new Error(`Music pack lifecycle fetch failed (${response.status})`);
      const payload = await response.json() as MusicPackLifecycleResponse;
      setPackLifecycle(payload);
    } catch {
      setPackLifecycle(null);
    }
  }, [isAuthenticated]);

  const loadFeaturedPack = useCallback(async ({ force = false }: { force?: boolean } = {}) => {
    if (!isAuthenticated) return;
    if (featuredPackRequestRef.current.inFlight) return;
    if (!force && featuredPackRequestRef.current.hasLoaded) return;

    featuredPackRequestRef.current.inFlight = true;
    featuredPackRequestRef.current.hasLoaded = true;
    setPackNotice(null);
    setMusicPackLoading(true);
    try {
      const response = await apiFetch("/api/ai/music-packs/featured", {
        method: "POST",
        body: JSON.stringify({ onboardingSeed }),
      });
      if (!response.ok) {
        if (response.status === 429) {
          setGeneratedPack(null);
          setPackNotice("Featured pack generation is temporarily rate-limited. Please wait and refresh manually.");
          return;
        }
        if (response.status >= 500) {
          setGeneratedPack(null);
          setPackNotice("Featured pack is temporarily unavailable. Showing fallback state.");
          return;
        }
        throw new Error(`Music pack generation failed (${response.status})`);
      }
      const payload = await response.json() as GeneratedMusicPackResponse;
      setGeneratedPack(payload);
      await loadPackLifecycle();
    } catch {
      setGeneratedPack(null);
      setPackNotice("Could not generate a featured pack right now.");
    } finally {
      featuredPackRequestRef.current.inFlight = false;
      setMusicPackLoading(false);
    }
  }, [isAuthenticated, loadPackLifecycle, onboardingSeed]);

  useEffect(() => {
    if (!isAuthenticated) {
      featuredPackRequestRef.current = { inFlight: false, hasLoaded: false };
      setGeneratedPack(null);
      setPackLifecycle(null);
      return;
    }
    void loadFeaturedPack();
  }, [isAuthenticated, loadFeaturedPack]);

  useEffect(() => {
    if (!isAuthenticated) {
      tasteSummaryRequestRef.current = { inFlight: false, hasLoaded: false };
      setTasteIdentitySummary(null);
      setTasteIdentityNotice(null);
      return;
    }
    if (tasteSummaryRequestRef.current.inFlight || tasteSummaryRequestRef.current.hasLoaded) return;
    tasteSummaryRequestRef.current.inFlight = true;
    tasteSummaryRequestRef.current.hasLoaded = true;
    const controller = new AbortController();
    async function loadTasteIdentity() {
      try {
        const response = await apiFetch("/api/ai/taste-identity/summary", {
          method: "POST",
          body: JSON.stringify({ onboardingSeed }),
          signal: controller.signal,
        });
        if (!response.ok) {
          if (response.status === 429) {
            setTasteIdentitySummary(null);
            setTasteIdentityNotice("Taste identity is temporarily rate-limited. Using local fallback summary.");
            return;
          }
          if (response.status >= 500) {
            setTasteIdentitySummary(null);
            setTasteIdentityNotice("Taste identity is temporarily unavailable. Using local fallback summary.");
            return;
          }
          throw new Error(`Taste identity summary failed (${response.status})`);
        }
        const payload = await response.json() as TasteIdentitySummaryResponse;
        setTasteIdentitySummary(payload);
        setTasteIdentityNotice(null);
      } catch {
        if (!controller.signal.aborted) {
          setTasteIdentitySummary(null);
          setTasteIdentityNotice("Could not load taste identity summary. Using local fallback.");
        }
      } finally {
        tasteSummaryRequestRef.current.inFlight = false;
      }
    }
    void loadTasteIdentity();
    return () => {
      controller.abort();
      tasteSummaryRequestRef.current.inFlight = false;
    };
  }, [isAuthenticated, onboardingSeed]);

  const featuredPackHiddenByDiscard = Boolean(
    generatedPack?.pack?.id
      && packLifecycle?.current?.packId === generatedPack.pack.id
      && packLifecycle.current.status === "discarded",
  );
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
      await loadPackLifecycle();
    } catch {
      setPackNotice("Could not save this pack right now.");
    } finally {
      setPackSaving(false);
    }
  }

  async function handleDiscardFeaturedPack() {
    if (!generatedPack?.pack) return;
    void apiFetch("/api/ai/music-packs/featured/lifecycle", {
      method: "POST",
      body: JSON.stringify({ packId: generatedPack.pack.id, action: "discard" }),
    }).then(() => loadPackLifecycle()).catch(() => null);
    setPackModalOpen(false);
    setPackNotice("Pack discarded. This outcome now stays in your recent pack lifecycle.");
  }

  async function handleBringBackPack() {
    if (!generatedPack?.pack) return;
    try {
      await apiFetch("/api/ai/music-packs/featured/lifecycle", {
        method: "POST",
        body: JSON.stringify({ packId: generatedPack.pack.id, action: "bring_back" }),
      });
      await loadPackLifecycle();
      setPackNotice("Discard cleared. The pack is active again.");
    } catch {
      setPackNotice("Could not clear discard right now.");
    }
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

  function handleOpenPackModal() {
    if (generatedPack?.pack?.id) {
      void apiFetch("/api/ai/music-packs/featured/lifecycle", {
        method: "POST",
        body: JSON.stringify({ packId: generatedPack.pack.id, action: "opened" }),
      }).catch(() => null);
    }
    setPackModalOpen(true);
  }

  function mapPackTrackToQueueTrack(track: GeneratedPackTrack) {
    return {
      id: track.trackKey,
      title: track.title,
      artist: track.artist,
      artistId: `pack-artist-${track.artist.toLowerCase().replace(/\s+/g, "-")}`,
      artworkUrl: track.coverUrl ?? "https://picsum.photos/seed/music-pack/80",
      query: `${track.title} ${track.artist} official audio`,
      license: "COPYRIGHTED" as const,
    };
  }

  function getPackTracksForScope(scope: "all" | "selected") {
    if (!generatedPack?.pack) return [];
    if (scope === "all") return generatedPack.pack.tracks;
    const selectedSet = new Set(selectedTrackKeys);
    return generatedPack.pack.tracks.filter((track) => selectedSet.has(track.trackKey));
  }

  function handlePackListen(mode: "play-now" | "add-queue", scope: "all" | "selected") {
    const scopedTracks = getPackTracksForScope(scope);
    if (scopedTracks.length === 0) {
      setPackNotice("Select at least one track before using selected listening actions.");
      return;
    }

    const [firstTrack, ...restTracks] = scopedTracks.map(mapPackTrackToQueueTrack);
    if (mode === "play-now") {
      playNow(firstTrack, "manual");
      if (restTracks.length > 0) addManyToQueue(restTracks, "manual");
      setPackNotice(scope === "all"
        ? `Playing "${generatedPack?.pack?.title}" now and queued ${scopedTracks.length} tracks.`
        : `Playing selected tracks now and queued ${scopedTracks.length} tracks.`);
      return;
    }

    addManyToQueue([firstTrack, ...restTracks], "manual");
    setPackNotice(scope === "all"
      ? `Added full pack to queue (${scopedTracks.length} tracks).`
      : `Added selected tracks to queue (${scopedTracks.length}).`);
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
            {tasteIdentityNotice ? <p className="mt-2">{tasteIdentityNotice}</p> : null}
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
          <div className="mt-4 grid min-h-[clamp(420px,70svh,760px)] grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 xl:min-h-[clamp(420px,74svh,760px)]">
              {themeStudioSlots.map((slot) => {
                const stateClassName = slot.state === "active"
                  ? "border-[var(--accent-border)] bg-[var(--panel-surface)]"
                  : slot.state === "available"
                    ? "border-[var(--border)] bg-[var(--panel-surface)]"
                    : slot.state === "bonus-locked"
                      ? "border-[var(--border)] bg-[var(--surface-subtle)]/70"
                      : "border-[var(--border)] bg-black/35";
                return (
                  <div key={slot.id} className={`flex min-h-[280px] flex-col rounded-xl border p-4 sm:min-h-[320px] xl:h-full ${stateClassName}`}>
                    <div className="flex items-center justify-between gap-2 border-b border-[var(--border)]/70 pb-3">
                      <p className="text-sm font-semibold">{slot.title}</p>
                      {slot.state === "active" ? <span className="rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] uppercase tracking-[0.08em]">Live</span> : null}
                      {slot.state === "bonus-locked" ? <Sparkles className="h-4 w-4 text-[var(--muted)]" /> : null}
                    </div>
                    <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)]/70 px-2.5 py-1.5">
                      <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--muted)]">{slot.subtitle}</p>
                    </div>
                    <div className="mt-3 flex-1 rounded-lg border border-[var(--border)]/80 bg-[var(--surface-subtle)]/40 p-3.5">
                      <p className="break-words text-xs leading-relaxed text-[var(--muted)]">{slot.details}</p>
                    </div>
                    <div className="mt-4 border-t border-[var(--border)]/70 pt-3">
                      {slot.cta ? (
                        <Link href={slot.cta.href}>
                          <Button variant="ghost" size="sm">
                            <span className="inline-flex items-center gap-1.5">{slot.cta.label}<ChevronRight className="h-3.5 w-3.5" /></span>
                          </Button>
                        </Link>
                      ) : (
                        <p className="text-[11px] text-[var(--muted)]">Slot status tracked in this preview panel.</p>
                      )}
                    </div>
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
                    {pack.state.includes("generated") && generatedPack?.pack?.id === pack.id && generatedPack.pack.explanation.stateNote ? (
                      <p className="mt-1 text-[11px] text-[var(--muted)]">{generatedPack.pack.explanation.stateNote}</p>
                    ) : null}
                    {pack.ctaLabel ? (
                      <button
                        type="button"
                        onClick={pack.ctaMode === "open" ? handleOpenPackModal : undefined}
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
                  <Button variant="secondary" size="sm" onClick={() => void loadFeaturedPack({ force: true })}>Generate again</Button>
                </div>
              </div>
            ) : null}
            {packNotice ? <p className="mt-3 text-xs text-[var(--muted)]">{packNotice}</p> : null}
            {packLifecycle?.history?.length ? (
              <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--panel-surface)] p-3">
                <p className="text-xs uppercase tracking-[0.08em] text-[var(--muted)]">Recent pack outcomes</p>
                <ul className="mt-2 space-y-1 text-xs text-[var(--muted)]">
                  {packLifecycle.history.slice(0, 4).map((entry) => (
                    <li key={`${entry.packId}-${entry.generatedAt}`} className="flex items-center justify-between gap-2">
                      <span className="truncate">{entry.title}</span>
                      <span>{entry.status}{entry.outcomeAt ? ` · ${formatUtcDate(entry.outcomeAt)}` : ""}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
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
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">Recommendation Snapshot</p>
              <h2 className="text-xl font-semibold">Current personalization settings</h2>
            </div>
            <TrendingUp className="h-5 w-5 text-[var(--accent)]" />
          </div>
          <p className="text-sm text-[var(--muted)]">
            Personalization editing moved to Settings. This page now keeps a read-only snapshot for context while you review identity and packs.
          </p>
          <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--panel-surface)] p-4">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)]/60 p-3">
              <p className="text-sm font-medium">Data sharing</p>
              <span className="rounded-full border border-[var(--border)] px-2.5 py-1 text-xs">{recommendationDataSharingEnabled ? "On" : "Off"}</span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)]/60 p-3">
              <p className="text-sm font-medium">Recommendation mode</p>
              <span className="rounded-full border border-[var(--border)] px-2.5 py-1 text-xs">{recommendationModeLabel}</span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)]/60 p-3">
              <p className="text-sm font-medium">Repeated artist tolerance</p>
              <span className="rounded-full border border-[var(--border)] px-2.5 py-1 text-xs capitalize">{repeatedArtistTolerance.replace("_", " ")}</span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)]/60 p-3">
              <p className="text-sm font-medium">Energy preference</p>
              <span className="rounded-full border border-[var(--border)] px-2.5 py-1 text-xs">{energyPreference === "more_energetic" ? "More energetic" : energyPreference === "calmer" ? "Calmer" : "Mixed"}</span>
            </div>
          </div>
          <div className="rounded-xl border border-dashed border-[var(--border)] p-3 text-xs text-[var(--muted)]">
            To edit these values, open <Link href="/settings#recommendation-data-sharing" className="underline">Recommendation preferences in Settings</Link>.
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
            {generatedPack.pack.explanation.reasonSignals?.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {generatedPack.pack.explanation.reasonSignals.slice(0, 4).map((signal) => (
                  <span key={signal} className="rounded-full border border-[var(--border)] bg-[var(--panel-surface)] px-2 py-0.5 text-[10px] text-[var(--muted)]">
                    {signal}
                  </span>
                ))}
              </div>
            ) : null}
            {generatedPack.pack.explanation.stateNote ? <p className="mt-2 text-[11px] text-[var(--muted)]">{generatedPack.pack.explanation.stateNote}</p> : null}
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
          <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--panel-surface)] p-3">
            <p className="text-xs uppercase tracking-[0.08em] text-[var(--muted)]">Listen now or queue</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" disabled={allTrackKeys.length === 0} onClick={() => handlePackListen("play-now", "all")}>Play pack now</Button>
              <Button variant="ghost" size="sm" disabled={allTrackKeys.length === 0} onClick={() => handlePackListen("add-queue", "all")}>Add pack to queue</Button>
              <Button variant="secondary" size="sm" disabled={selectedCount === 0} onClick={() => handlePackListen("play-now", "selected")}>Play selected</Button>
              <Button variant="ghost" size="sm" disabled={selectedCount === 0} onClick={() => handlePackListen("add-queue", "selected")}>Add selected to queue</Button>
            </div>
            {selectedCount === 0 ? <p className="text-xs text-amber-300">Select at least one track for selected listening or save-selected actions.</p> : null}
          </div>
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
