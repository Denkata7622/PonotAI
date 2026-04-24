"use client";

import { useMemo, type RefObject } from "react";
import { ChevronDown, Keyboard, ListMusic, Pause, Play, RotateCcw, SkipBack, SkipForward, Sparkles, Volume2, VolumeX } from "lucide-react";
import { useLanguage } from "../../lib/LanguageContext";
import { usePlayer } from "../PlayerProvider";
import QueuePanel from "@/src/components/player/QueuePanel";
import MusicAssistantPage from "@/src/features/assistant/components/MusicAssistantPage";
import { formatPlayerTime, getRepeatModeLabel, useVolumeUi } from "./playerUiUtils";

type WorkspaceTab = "queue" | "assistant" | "context";

type NowPlayingWorkspaceProps = {
  isOpen: boolean;
  phase: "closed" | "mounted-from-dock" | "opening" | "open" | "closing";
  dockOrigin: { scaleX: number; scaleY: number; translateX: number; translateY: number } | null;
  workspaceTab: WorkspaceTab;
  onWorkspaceTabChange: (tab: WorkspaceTab) => void;
  onClose: () => void;
  expandedVideoHostRef: RefObject<HTMLDivElement | null>;
};

export default function NowPlayingWorkspace({ isOpen, phase, dockOrigin, workspaceTab, onWorkspaceTabChange, onClose, expandedVideoHostRef }: NowPlayingWorkspaceProps) {
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
  const { isVolumePanelOpen, setIsVolumePanelOpen, toggleMute, updateVolume } = useVolumeUi(volume, setVolume);
  const youtubeSearchUrl = currentTrack
    ? `https://www.youtube.com/results?search_query=${encodeURIComponent(`${currentTrack.title} ${currentTrack.artist}`)}`
    : "#";

  if (!isOpen || !currentTrack || !currentVideoId) return null;

  const collapsedTransform = dockOrigin
    ? `translate3d(${dockOrigin.translateX}px, ${dockOrigin.translateY}px, 0) scale3d(${dockOrigin.scaleX}, ${dockOrigin.scaleY}, 1)`
    : "translate3d(0, 100%, 0) scale3d(1, 0.12, 1)";
  const transformStyle = phase === "open" || phase === "opening" ? "translate3d(0,0,0) scale3d(1,1,1)" : collapsedTransform;

  return (
    <section
      className="flex h-full min-h-0 flex-1 origin-bottom flex-col overflow-hidden rounded-2xl bg-[var(--surface)] transition-transform duration-[260ms] ease-[cubic-bezier(0.22,0.61,0.36,1)]"
      style={{ transform: transformStyle }}
      aria-label={isBg ? "Разширен плейър" : "Expanded now playing workspace"}
    >
      <div className="flex items-center justify-between px-4 py-3 md:px-6">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.12em] text-text-muted">{isBg ? "Плейър" : "Player workspace"}</p>
          <p className="truncate text-sm font-semibold text-[var(--text)]">{currentTrack.title} · {currentTrack.artist}</p>
        </div>
        <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full bg-[var(--surface-subtle)]" aria-label={isBg ? "Свий плейъра" : "Collapse player workspace"}><ChevronDown className="h-5 w-5 text-[var(--text)]" /></button>
      </div>

      <div className="grid h-full min-h-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] gap-3 px-3 pb-3 pt-2 md:grid-cols-[minmax(200px,240px)_minmax(0,1fr)_minmax(290px,340px)] md:grid-rows-1 md:gap-4 md:px-5 md:pb-5">
        <aside className="order-1 hidden h-full min-h-0 md:block md:pt-2">
          <div className="space-y-3 rounded-2xl bg-[var(--surface-subtle)] p-4">
            {currentTrack.artworkUrl ? <img src={currentTrack.artworkUrl} alt={isBg ? "Обложка" : "Artwork"} className="h-48 w-full rounded-xl object-cover" /> : <div className="h-48 w-full rounded-xl bg-[var(--surface-raised)]" />}
            <div>
              <p className="line-clamp-2 text-base font-semibold text-[var(--text)]">{currentTrack.title}</p>
              <p className="mt-1 text-sm text-text-muted">{currentTrack.artist}</p>
            </div>
          </div>
        </aside>

        <main className="order-2 flex h-full min-h-0 flex-col overflow-hidden md:pt-2">
          <div className="overflow-hidden rounded-2xl bg-black">
            <div ref={expandedVideoHostRef} className="aspect-video w-full" />
          </div>

          <div className="mt-3">
            <input type="range" min={0} max={100} step={0.1} value={progress} onChange={(event) => seekToPercent(Number(event.target.value))} className="h-8 w-full themed-progress" aria-label={isBg ? "Прогрес" : "Track progress"} />
            <div className="mt-1 flex items-center justify-between text-xs text-text-muted"><span>{formatPlayerTime(currentTime)}</span><span>{formatPlayerTime(duration)}</span></div>
          </div>

          <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-2xl bg-[var(--surface-subtle)] p-2 md:p-3">
            <div className="flex justify-end gap-2">
              <button onClick={cycleRepeatMode} className={`inline-flex h-11 w-11 items-center justify-center rounded-full ${repeatMode === "normal" ? "bg-[var(--surface)] text-[var(--muted)]" : "bg-[var(--accent-soft)] text-[var(--text)]"}`} aria-label={repeatLabel}><RotateCcw className="h-4 w-4" /></button>
              <button onClick={skipPrevious} className="grid h-11 w-11 place-items-center rounded-full bg-[var(--surface)]" aria-label="Previous"><SkipBack className="h-4 w-4 text-[var(--text)]" /></button>
            </div>
            <button onClick={togglePlayPause} className="grid h-14 w-14 place-items-center rounded-full bg-[var(--accent-soft)]" aria-label={isPlaying ? (isBg ? "Пауза" : "Pause playback") : (isBg ? "Пусни" : "Start playback")}>{isPlaying ? <Pause className="h-6 w-6 text-[var(--text)]" /> : <Play className="h-6 w-6 text-[var(--text)]" />}</button>
            <div className="flex items-center gap-2">
              <button onClick={skipNext} className="grid h-11 w-11 place-items-center rounded-full bg-[var(--surface)]" aria-label="Next"><SkipForward className="h-4 w-4 text-[var(--text)]" /></button>
              <div className="relative">
                <button onClick={() => setIsVolumePanelOpen((prev) => !prev)} className="grid h-11 w-11 place-items-center rounded-full bg-[var(--surface)]" aria-label={isBg ? "Сила на звука" : "Volume controls"}>{volume === 0 ? <VolumeX className="h-4 w-4 text-[var(--muted)]" /> : <Volume2 className="h-4 w-4 text-[var(--text)]" />}</button>
                {isVolumePanelOpen ? (
                  <div className="absolute bottom-[calc(100%+8px)] right-0 z-30 rounded-xl border border-border bg-[var(--surface)] p-3 shadow-xl">
                    <button
                      type="button"
                      onClick={toggleMute}
                      className="mb-2 w-full rounded-lg bg-[var(--surface-subtle)] px-2 py-1 text-xs text-[var(--text)]"
                    >
                      {volume === 0 ? (isBg ? "Включи звук" : "Unmute") : (isBg ? "Изключи звук" : "Mute")}
                    </button>
                    <input type="range" min={0} max={100} value={volume} onChange={(event) => updateVolume(Number(event.target.value))} className="h-28 w-8 accent-[var(--accent)]" aria-label={isBg ? "Сила на звука" : "Volume"} />
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          {playerError ? <p className="mt-3 text-xs status-danger">{playerError}</p> : null}
        </main>

        <aside className="order-3 flex h-full min-h-0 flex-col overflow-hidden rounded-2xl bg-[var(--surface-subtle)] p-3 md:order-3 md:mt-2 md:p-4">
          <div className="app-tabs">
            <button onClick={() => onWorkspaceTabChange("queue")} className={`app-tab inline-flex items-center justify-center gap-1 text-xs ${workspaceTab === "queue" ? "app-tab-active" : ""}`}><ListMusic className="h-3.5 w-3.5" />{isBg ? "Опашка" : "Queue"}</button>
            <button onClick={() => onWorkspaceTabChange("assistant")} className={`app-tab inline-flex items-center justify-center gap-1 text-xs ${workspaceTab === "assistant" ? "app-tab-active" : ""}`}><Sparkles className="h-3.5 w-3.5" />AI</button>
            <button onClick={() => onWorkspaceTabChange("context")} className={`app-tab inline-flex items-center justify-center gap-1 text-xs ${workspaceTab === "context" ? "app-tab-active" : ""}`}><Keyboard className="h-3.5 w-3.5" />{isBg ? "Контекст" : "Context"}</button>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden pt-3">
            {workspaceTab === "queue" ? <div className="h-full overflow-auto"><QueuePanel /></div> : null}
            {workspaceTab === "assistant" ? <div className="h-full overflow-auto"><MusicAssistantPage mode="sidebar" sidebarOpen={isOpen} /></div> : null}
            {workspaceTab === "context" ? (
              <div className="h-full overflow-auto rounded-2xl bg-[var(--surface)] p-4">
                <p className="text-xs uppercase tracking-[0.1em] text-text-muted">{isBg ? "Текущ контекст" : "Current context"}</p>
                <p className="mt-2 text-lg font-semibold">{currentTrack.title}</p>
                <p className="text-sm text-text-muted">{currentTrack.artist}</p>
                <a className="mt-4 inline-block text-sm underline" href={youtubeSearchUrl} target="_blank" rel="noreferrer">{isBg ? "Отвори в YouTube" : "Open in YouTube"}</a>
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </section>
  );
}
