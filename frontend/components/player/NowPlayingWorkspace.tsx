"use client";

import { useCallback, useMemo, type RefObject } from "react";
import { ChevronDown, Keyboard, ListMusic, Music, Pause, Play, RotateCcw, SkipBack, SkipForward, Sparkles, Volume2, VolumeX } from "lucide-react";
import { useLanguage } from "../../lib/LanguageContext";
import { t } from "../../lib/translations";
import { usePlayer } from "../PlayerProvider";
import QueuePanel from "@/src/components/player/QueuePanel";
import MusicAssistantPage from "@/src/features/assistant/components/MusicAssistantPage";
import { formatPlayerTime, getRepeatModeLabel, getRepeatModeTooltip, useVolumeUi } from "./playerUiUtils";

type WorkspaceTab = "queue" | "assistant" | "context";

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
  } = usePlayer();

  const progress = useMemo(() => (duration ? Math.min(100, (currentTime / duration) * 100) : 0), [currentTime, duration]);
  const repeatLabel = getRepeatModeLabel(repeatMode, isBg);
  const repeatTooltip = getRepeatModeTooltip(repeatMode, isBg);
  const { isVolumePanelOpen, setIsVolumePanelOpen, toggleMute, updateVolume } = useVolumeUi(volume, setVolume);
  const youtubeSearchUrl = currentTrack
    ? `https://www.youtube.com/results?search_query=${encodeURIComponent(`${currentTrack.title} ${currentTrack.artist}`)}`
    : "#";
  const setExpandedSlotNode = useCallback((node: HTMLDivElement | null) => {
    expandedVideoSlotRef.current = node;
    onExpandedVideoSlotRefChange?.(node);
  }, [expandedVideoSlotRef, onExpandedVideoSlotRefChange]);

  if (!currentTrack || !currentVideoId) return null;

  const queueLabel = isBg ? "Опашка" : "Queue";
  const contextLabel = t("nav_context", language);
  const currentContextLabel = t("context_current", language);
  const openYoutubeLabel = t("open_in_youtube", language);
  const expandedLabel = isBg ? "Разширен плейър" : "Expanded now playing workspace";
  const collapseLabel = t("btn_collapse", language);
  const artworkLabel = t("song_artwork", language);
  const activePlaybackLabel = isBg ? "Възпроизвеждането продължава в долния плеър." : "Playback continues in the dock.";

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
            <p className="text-xs uppercase text-[var(--muted)]">{contextLabel}</p>
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
              <input type="range" min={0} max={100} step={0.1} value={progress} onChange={(event) => seekToPercent(Number(event.target.value))} className="h-6 w-full themed-progress md:h-8" aria-label={t("track_progress", language)} />
              <div className="mt-1 flex items-center justify-between text-xs text-[var(--muted)]"><span>{formatPlayerTime(currentTime)}</span><span>{formatPlayerTime(duration)}</span></div>
            </div>

            <div className="mt-1.5 grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-1.5 md:mt-2">
              <div className="flex items-center justify-start gap-1">
                <button onClick={cycleRepeatMode} className={`inline-flex h-10 w-10 items-center justify-center rounded-full ${repeatMode === "normal" ? "bg-[var(--surface-subtle)] text-[var(--muted)]" : "bg-[var(--accent-soft)] text-[var(--text)]"}`} aria-label={repeatLabel} title={repeatTooltip}>
                  {repeatMode === "normal" ? <RotateCcw className="h-4 w-4" /> : repeatMode === "queue" ? <ListMusic className="h-4 w-4" /> : <Music className="h-4 w-4" />}
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
              <button onClick={() => onWorkspaceTabChange("context")} className={`app-tab inline-flex items-center justify-center gap-1 text-xs ${workspaceTab === "context" ? "app-tab-active" : ""}`}><Keyboard className="h-3.5 w-3.5" />{contextLabel}</button>
            </div>
            <div className="mt-1.5 min-h-0 flex-1 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-1 md:mt-2 md:p-2 xl:hidden">
              {workspaceTab === "queue" ? <QueuePanel compact /> : null}
              {workspaceTab === "assistant" ? <MusicAssistantPage mode="sidebar" sidebarOpen /> : null}
              {workspaceTab === "context" ? (
                <div className="h-full overflow-auto rounded-xl bg-[var(--surface)] p-4">
                  <p className="text-xs uppercase text-[var(--muted)]">{currentContextLabel}</p>
                  <p className="mt-2 text-lg font-semibold text-[var(--text)]">{currentTrack.title}</p>
                  <p className="text-sm text-[var(--muted)]">{currentTrack.artist}</p>
                  <a className="mt-4 inline-block text-sm text-[var(--accent)] underline" href={youtubeSearchUrl} target="_blank" rel="noreferrer">{openYoutubeLabel}</a>
                </div>
              ) : null}
            </div>
          </main>

          <aside className="hidden min-h-0 flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] p-3 xl:flex">
            <div className="shrink-0 app-tabs">
              <button onClick={() => onWorkspaceTabChange("queue")} className={`app-tab inline-flex items-center justify-center gap-1 text-xs ${workspaceTab === "queue" ? "app-tab-active" : ""}`}><ListMusic className="h-3.5 w-3.5" />{queueLabel}</button>
              <button onClick={() => onWorkspaceTabChange("assistant")} className={`app-tab inline-flex items-center justify-center gap-1 text-xs ${workspaceTab === "assistant" ? "app-tab-active" : ""}`}><Sparkles className="h-3.5 w-3.5" />AI</button>
              <button onClick={() => onWorkspaceTabChange("context")} className={`app-tab inline-flex items-center justify-center gap-1 text-xs ${workspaceTab === "context" ? "app-tab-active" : ""}`}><Keyboard className="h-3.5 w-3.5" />{contextLabel}</button>
            </div>
            <div className="mt-3 min-h-0 flex-1 overflow-auto rounded-xl bg-[var(--surface-raised)] p-2">
              {workspaceTab === "queue" ? <QueuePanel /> : null}
              {workspaceTab === "assistant" ? <MusicAssistantPage mode="sidebar" sidebarOpen /> : null}
              {workspaceTab === "context" ? (
                <div className="rounded-xl bg-[var(--surface)] p-4">
                  <p className="text-xs uppercase text-[var(--muted)]">{currentContextLabel}</p>
                  <p className="mt-2 text-lg font-semibold text-[var(--text)]">{currentTrack.title}</p>
                  <p className="text-sm text-[var(--muted)]">{currentTrack.artist}</p>
                  <a className="mt-4 inline-block text-sm text-[var(--accent)] underline" href={youtubeSearchUrl} target="_blank" rel="noreferrer">{openYoutubeLabel}</a>
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
