"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { ArrowLeftRight, ChevronDown, ListMusic, Music, Pause, Play, RefreshCwOff, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Sparkles, Volume2, VolumeX } from "../../lucide-react";
import { useLanguage } from "../../lib/LanguageContext";
import { t } from "../../lib/translations";
import { usePlayer } from "../PlayerProvider";
import QueuePanel from "@/src/components/player/QueuePanel";
import MusicAssistantPage from "@/src/features/assistant/components/MusicAssistantPage";
import { formatPlayerTime, getRepeatModeLabel, getRepeatModeTooltip, useVolumeUi } from "./playerUiUtils";
import { shouldCommitScrub } from "../../features/player/state";

type WorkspaceTab = "queue" | "assistant" | "lyrics";
const SCRUB_COMMIT_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown", "Enter", " ", "Spacebar"]);

type NowPlayingWorkspaceProps = {
  workspaceTab: WorkspaceTab;
  onWorkspaceTabChange: (tab: WorkspaceTab) => void;
  onClose: () => void;
  expandedVideoSlotRef: RefObject<HTMLDivElement | null>;
  onExpandedVideoSlotRefChange?: (node: HTMLDivElement | null) => void;
};

export default function NowPlayingWorkspace({ workspaceTab, onWorkspaceTabChange, onClose, expandedVideoSlotRef, onExpandedVideoSlotRefChange }: NowPlayingWorkspaceProps) {
  const { language } = useLanguage();
  const isBg = language === "bg";
  const {
    currentTrack,
    currentVideoId,
    isPlaying,
    currentTime,
    duration,
    volume,
    playerError,
    togglePlayPause,
    seekToPercent,
    setVolume,
    skipNext,
    skipPrevious,
    repeatMode,
    cycleRepeatMode,
    shuffleEnabled,
    toggleShuffle,
  } = usePlayer();

  const progress = useMemo(() => (duration ? Math.min(100, (currentTime / duration) * 100) : 0), [currentTime, duration]);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [localScrubPercent, setLocalScrubPercent] = useState(progress);
  const latestScrubPercentRef = useRef(progress);
  const isScrubbingRef = useRef(false);
  const scrubTokenRef = useRef(0);
  const committedScrubTokenRef = useRef(0);
  const repeatLabel = getRepeatModeLabel(repeatMode, isBg);
  const repeatTooltip = getRepeatModeTooltip(repeatMode, isBg);
  const shuffleLabel = shuffleEnabled ? (isBg ? "Разбъркано" : "Shuffle") : (isBg ? "Подредено" : "Straight order");
  const shuffleTooltip = shuffleEnabled ? (isBg ? "Разбъркано • натисни за подредено" : "Shuffle • click for straight order") : (isBg ? "Подредено • натисни за разбъркано" : "Straight order • click to shuffle");
  const [lyrics, setLyrics] = useState<string | null>(null);
  const [isLyricsLoading, setIsLyricsLoading] = useState(false);
  const lastFetchedLyricsKeyRef = useRef<string | null>(null);
  const { isVolumePanelOpen, setIsVolumePanelOpen, toggleMute, updateVolume } = useVolumeUi(volume, setVolume);
  const youtubeSearchUrl = currentTrack
    ? `https://www.youtube.com/results?search_query=${encodeURIComponent(`${currentTrack.title} ${currentTrack.artist}`)}`
    : "#";
  const setExpandedSlotNode = useCallback((node: HTMLDivElement | null) => {
    expandedVideoSlotRef.current = node;
    onExpandedVideoSlotRefChange?.(node);
  }, [expandedVideoSlotRef, onExpandedVideoSlotRefChange]);

  useEffect(() => {
    if (isScrubbing) return;
    latestScrubPercentRef.current = progress;
    setLocalScrubPercent(progress);
  }, [isScrubbing, progress]);

  useEffect(() => {
    isScrubbingRef.current = isScrubbing;
  }, [isScrubbing]);

  const beginScrub = useCallback(() => {
    if (isScrubbingRef.current) return;
    isScrubbingRef.current = true;
    scrubTokenRef.current += 1;
    setIsScrubbing(true);
  }, []);

  const commitSeek = useCallback(() => {
    if (!isScrubbingRef.current) return;
    const scrubToken = scrubTokenRef.current;
    if (!shouldCommitScrub(scrubToken, committedScrubTokenRef.current)) {
      isScrubbingRef.current = false;
      setIsScrubbing(false);
      return;
    }
    committedScrubTokenRef.current = scrubToken;
    isScrubbingRef.current = false;
    seekToPercent(latestScrubPercentRef.current);
    setIsScrubbing(false);
  }, [seekToPercent]);

  const displayedCurrentTime = useMemo(
    () => (isScrubbing ? (Math.max(0, Math.min(100, localScrubPercent)) / 100) * duration : currentTime),
    [currentTime, duration, isScrubbing, localScrubPercent],
  );
  const lyricsKey = useMemo(() => {
    if (!currentTrack?.artist || !currentTrack?.title) return null;
    return `${currentTrack.artist}::${currentTrack.title}`;
  }, [currentTrack?.artist, currentTrack?.title]);

  useEffect(() => {
    setLyrics(null);
    setIsLyricsLoading(false);
    lastFetchedLyricsKeyRef.current = null;
  }, [lyricsKey]);

  useEffect(() => {
    if (workspaceTab !== "lyrics") return;
    if (!lyricsKey || !currentTrack?.title || !currentTrack?.artist) return;
    if (lastFetchedLyricsKeyRef.current === lyricsKey) return;

    let cancelled = false;
    setIsLyricsLoading(true);
    void (async () => {
      try {
        const response = await fetch(`/api/lyrics?artist=${encodeURIComponent(currentTrack.artist)}&title=${encodeURIComponent(currentTrack.title)}`);
        if (!response.ok) {
          if (!cancelled) {
            setLyrics("");
            lastFetchedLyricsKeyRef.current = lyricsKey;
          }
          return;
        }
        const payload = await response.json() as { lyrics?: string | null };
        if (!cancelled) {
          setLyrics(payload.lyrics ?? "");
          lastFetchedLyricsKeyRef.current = lyricsKey;
        }
      } catch {
        if (!cancelled) {
          setLyrics("");
          lastFetchedLyricsKeyRef.current = lyricsKey;
        }
      } finally {
        if (!cancelled) setIsLyricsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentTrack?.artist, currentTrack?.title, lyricsKey, workspaceTab]);

  if (!currentTrack || !currentVideoId) return null;

  const queueLabel = isBg ? "Опашка" : "Queue";
  const nowPlayingLabel = isBg ? "Сега звучи" : "Now playing";
  const lyricsLabel = isBg ? "Текст" : "Lyrics";
  const openYoutubeLabel = t("open_in_youtube", language);
  const expandedLabel = isBg ? "Разширен плейър" : "Expanded now playing workspace";
  const collapseLabel = t("btn_collapse", language);
  const artworkLabel = t("song_artwork", language);
  const activePlaybackLabel = isBg ? "Възпроизвеждането продължава в долния плеър." : "Playback continues in the dock.";
  const lyricsUnavailableLabel = isBg ? "Текстът не е наличен за тази песен." : "Lyrics are not available yet for this track.";

  const lyricsPanel = (
    <div className="h-full overflow-auto rounded-xl bg-[var(--surface)] p-4">
      <p className="text-xs uppercase text-[var(--muted)]">{lyricsLabel}</p>
      <p className="mt-2 text-lg font-semibold text-[var(--text)]">{currentTrack.title}</p>
      <p className="text-sm text-[var(--muted)]">{currentTrack.artist}</p>
      <div className="mt-4 whitespace-pre-wrap text-sm leading-6 text-[var(--text)]">
        {isLyricsLoading ? (isBg ? "Зареждане..." : "Loading...") : (lyrics && lyrics.trim().length > 0 ? lyrics : lyricsUnavailableLabel)}
      </div>
      <a className="mt-4 inline-block text-sm text-[var(--accent)] underline" href={youtubeSearchUrl} target="_blank" rel="noreferrer">{openYoutubeLabel}</a>
    </div>
  );

  const volumePanel = (
    <div
      className="absolute bottom-[calc(100%+8px)] right-0 z-30 flex w-[min(18rem,calc(100vw-1.5rem))] items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-2.5 shadow-2xl"
      style={{ background: "color-mix(in srgb, var(--surface-raised) 92%, var(--bg) 8%)" }}
    >
      <button type="button" onClick={toggleMute} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-subtle)] text-[var(--text)]" aria-label={volume === 0 ? t("btn_unmute", language) : t("btn_mute", language)}>
        {volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </button>
      <input type="range" min={0} max={100} value={volume} onChange={(event) => updateVolume(Number(event.target.value))} className="h-8 min-w-0 flex-1 accent-[var(--accent)]" aria-label={t("volume", language)} />
      <span className="w-10 shrink-0 text-right text-xs text-[var(--muted)]">{Math.round(volume)}%</span>
    </div>
  );

  return (
    <section
      className="now-playing-workspace absolute inset-0 overflow-hidden px-2 pb-[calc(10px+env(safe-area-inset-bottom,0px))] pt-[max(env(safe-area-inset-top,0px),10px)] sm:px-4 sm:pb-4"
      aria-label={expandedLabel}
    >
      <div className="now-playing-card mx-auto flex h-full min-h-0 max-w-7xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-surface/95 shadow-2xl backdrop-blur-xl">
        <header className="now-playing-dock shrink-0 border-b border-[var(--border)] bg-[var(--surface-raised)]/95 px-2 py-2 sm:px-4">
          <div className="flex min-h-12 items-center gap-2 sm:min-h-14 sm:gap-3">
            <button type="button" onClick={onClose} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1.5 py-1 text-left transition hover:bg-[var(--surface-subtle)]" aria-label={collapseLabel}>
              {currentTrack.artworkUrl ? (
                <img src={currentTrack.artworkUrl} alt={artworkLabel} className="h-10 w-10 shrink-0 rounded-lg object-cover sm:h-11 sm:w-11" />
              ) : (
                <div className="h-10 w-10 shrink-0 rounded-lg bg-[var(--surface-subtle)] sm:h-11 sm:w-11" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[var(--text)]">{currentTrack.title}</p>
                <p className="truncate text-xs text-[var(--muted)]">{currentTrack.artist}</p>
              </div>
            </button>
            <div className="hidden items-center gap-1 rounded-full bg-[var(--surface-subtle)] p-1 sm:flex">
              <button onClick={skipPrevious} className="grid h-9 w-9 place-items-center rounded-full" aria-label="Previous"><SkipBack className="h-4 w-4 text-[var(--text)]" /></button>
              <button onClick={togglePlayPause} className="grid h-10 w-10 place-items-center rounded-full bg-[var(--accent-soft)]" aria-label={isPlaying ? t("btn_pause", language) : t("btn_play", language)}>{isPlaying ? <Pause className="h-4 w-4 text-[var(--text)]" /> : <Play className="h-4 w-4 text-[var(--text)]" />}</button>
              <button onClick={skipNext} className="grid h-9 w-9 place-items-center rounded-full" aria-label="Next"><SkipForward className="h-4 w-4 text-[var(--text)]" /></button>
            </div>
            <button onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--surface-subtle)]" aria-label={collapseLabel}>
              <ChevronDown className="h-5 w-5 text-[var(--text)]" />
            </button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 gap-2 overflow-hidden p-2 md:grid-cols-[minmax(190px,260px)_minmax(0,1fr)] md:p-3 xl:grid-cols-[minmax(220px,280px)_minmax(0,1fr)_minmax(300px,360px)]">
          <aside className="hidden min-h-0 overflow-auto rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] p-3 md:block">
            <p className="text-xs uppercase text-[var(--muted)]">{nowPlayingLabel}</p>
            <p className="mt-2 line-clamp-3 text-base font-semibold text-[var(--text)]">{currentTrack.title}</p>
            <p className="mt-1 text-sm text-[var(--muted)]">{currentTrack.artist}</p>
            <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] p-3">
              <p className="text-xs text-[var(--muted)]">{activePlaybackLabel}</p>
            </div>
            <a className="mt-4 inline-block text-sm text-[var(--accent)] underline" href={youtubeSearchUrl} target="_blank" rel="noreferrer">{openYoutubeLabel}</a>
          </aside>

          <main className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] p-2 md:p-3">
            <div className="shrink-0 overflow-hidden rounded-lg bg-black">
              <div
                ref={setExpandedSlotNode}
                data-yt-video-slot="expanded"
                className="aspect-video max-h-[24dvh] w-full sm:max-h-[30dvh] md:max-h-none"
              />
            </div>

            <div className="mt-1.5 shrink-0 md:mt-2">
              <input
                type="range"
                min={0}
                max={100}
                step={0.1}
                value={isScrubbing ? localScrubPercent : progress}
                onPointerDown={beginScrub}
                onMouseDown={beginScrub}
                onTouchStart={beginScrub}
                onChange={(event) => {
                  const nextPercent = Number(event.target.value);
                  latestScrubPercentRef.current = nextPercent;
                  setLocalScrubPercent(nextPercent);
                  if (!isScrubbingRef.current) seekToPercent(nextPercent);
                }}
                onPointerUp={commitSeek}
                onMouseUp={commitSeek}
                onTouchEnd={commitSeek}
                onBlur={commitSeek}
                onKeyDown={(event) => {
                  if (SCRUB_COMMIT_KEYS.has(event.key)) beginScrub();
                }}
                onKeyUp={(event) => {
                  if (SCRUB_COMMIT_KEYS.has(event.key)) commitSeek();
                }}
                className="h-6 w-full themed-progress md:h-8"
                aria-label={t("track_progress", language)}
              />
              <div className="mt-1 flex items-center justify-between text-xs text-[var(--muted)]"><span>{formatPlayerTime(displayedCurrentTime)}</span><span>{formatPlayerTime(duration)}</span></div>
            </div>

            <div className="mt-1.5 grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-1.5 md:mt-2">
              <div className="flex items-center justify-start gap-1">
                <button onClick={cycleRepeatMode} className={`inline-flex h-10 w-10 items-center justify-center rounded-full ${repeatMode === "normal" ? "bg-[var(--surface-subtle)] text-[var(--muted)]" : "bg-[var(--accent-soft)] text-[var(--text)]"}`} aria-label={repeatLabel} title={repeatTooltip}>
                  {repeatMode === "normal" ? <RefreshCwOff className="h-4 w-4" /> : repeatMode === "queue" ? <Repeat className="h-4 w-4" /> : <Repeat1 className="h-4 w-4" />}
                </button>
                <button onClick={toggleShuffle} className={`inline-flex h-10 w-10 items-center justify-center rounded-full ${shuffleEnabled ? "bg-[var(--accent-soft)] text-[var(--text)]" : "bg-[var(--surface-subtle)] text-[var(--muted)]"}`} aria-label={shuffleLabel} title={shuffleTooltip}>
                  {shuffleEnabled ? <Shuffle className="h-4 w-4" /> : <ArrowLeftRight className="h-4 w-4" />}
                </button>
                <button onClick={() => onWorkspaceTabChange("queue")} className={`relative grid h-10 w-10 place-items-center rounded-full ${workspaceTab === "queue" ? "bg-[var(--accent-soft)] text-[var(--text)]" : "bg-[var(--surface-subtle)] text-[var(--text)]"}`} aria-label={queueLabel}><ListMusic className="h-4 w-4" /></button>
              </div>
              <div className="flex items-center justify-center gap-1 rounded-full bg-[var(--surface-subtle)] p-1">
                <button onClick={skipPrevious} className="grid h-9 w-9 place-items-center rounded-full" aria-label="Previous"><SkipBack className="h-4 w-4 text-[var(--text)]" /></button>
                <button onClick={togglePlayPause} className="grid h-10 w-10 place-items-center rounded-full bg-[var(--accent-soft)]" aria-label={isPlaying ? t("btn_pause", language) : t("btn_play", language)}>{isPlaying ? <Pause className="h-5 w-5 text-[var(--text)]" /> : <Play className="h-5 w-5 text-[var(--text)]" />}</button>
                <button onClick={skipNext} className="grid h-9 w-9 place-items-center rounded-full" aria-label="Next"><SkipForward className="h-4 w-4 text-[var(--text)]" /></button>
              </div>
              <div className="flex items-center justify-end">
                <div className="relative">
                  <button onClick={() => setIsVolumePanelOpen((prev) => !prev)} className="grid h-10 w-10 place-items-center rounded-full bg-[var(--surface-subtle)]" aria-label={t("volume_controls", language)}>{volume === 0 ? <VolumeX className="h-4 w-4 text-[var(--muted)]" /> : <Volume2 className="h-4 w-4 text-[var(--text)]" />}</button>
                  {isVolumePanelOpen ? volumePanel : null}
                </div>
              </div>
            </div>
            {playerError ? <p className="mt-1.5 shrink-0 text-xs status-danger">{playerError}</p> : null}

            <div className="mt-1.5 shrink-0 app-tabs md:mt-2 xl:hidden">
              <button onClick={() => onWorkspaceTabChange("queue")} className={`app-tab inline-flex items-center justify-center gap-1 text-xs ${workspaceTab === "queue" ? "app-tab-active" : ""}`}><ListMusic className="h-3.5 w-3.5" />{queueLabel}</button>
              <button onClick={() => onWorkspaceTabChange("assistant")} className={`app-tab inline-flex items-center justify-center gap-1 text-xs ${workspaceTab === "assistant" ? "app-tab-active" : ""}`}><Sparkles className="h-3.5 w-3.5" />AI</button>
              <button onClick={() => onWorkspaceTabChange("lyrics")} className={`app-tab inline-flex items-center justify-center gap-1 text-xs ${workspaceTab === "lyrics" ? "app-tab-active" : ""}`}><Music className="h-3.5 w-3.5" />{lyricsLabel}</button>
            </div>
            <div className="mt-1.5 min-h-0 flex-1 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-1 md:mt-2 md:p-2 xl:hidden">
              {workspaceTab === "queue" ? <QueuePanel compact /> : null}
              {workspaceTab === "assistant" ? <MusicAssistantPage mode="sidebar" sidebarOpen /> : null}
              {workspaceTab === "lyrics" ? lyricsPanel : null}
            </div>
          </main>

          <aside className="hidden min-h-0 flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] p-3 xl:flex">
            <div className="shrink-0 app-tabs">
              <button onClick={() => onWorkspaceTabChange("queue")} className={`app-tab inline-flex items-center justify-center gap-1 text-xs ${workspaceTab === "queue" ? "app-tab-active" : ""}`}><ListMusic className="h-3.5 w-3.5" />{queueLabel}</button>
              <button onClick={() => onWorkspaceTabChange("assistant")} className={`app-tab inline-flex items-center justify-center gap-1 text-xs ${workspaceTab === "assistant" ? "app-tab-active" : ""}`}><Sparkles className="h-3.5 w-3.5" />AI</button>
              <button onClick={() => onWorkspaceTabChange("lyrics")} className={`app-tab inline-flex items-center justify-center gap-1 text-xs ${workspaceTab === "lyrics" ? "app-tab-active" : ""}`}><Music className="h-3.5 w-3.5" />{lyricsLabel}</button>
            </div>
            <div className="mt-3 min-h-0 flex-1 overflow-auto rounded-xl bg-[var(--surface-raised)] p-2">
              {workspaceTab === "queue" ? <QueuePanel /> : null}
              {workspaceTab === "assistant" ? <MusicAssistantPage mode="sidebar" sidebarOpen /> : null}
              {workspaceTab === "lyrics" ? lyricsPanel : null}
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
