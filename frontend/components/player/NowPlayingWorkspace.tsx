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
  phase: "closed" | "opening" | "open" | "closing";
  workspaceTab: WorkspaceTab;
  onWorkspaceTabChange: (tab: WorkspaceTab) => void;
  onClose: () => void;
  expandedVideoHostRef: RefObject<HTMLDivElement | null>;
};

export default function NowPlayingWorkspace({ isOpen, phase, workspaceTab, onWorkspaceTabChange, onClose, expandedVideoHostRef }: NowPlayingWorkspaceProps) {
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

  return (
    <section
      className={`h-full min-h-0 transition-[transform,opacity] duration-200 motion-reduce:transition-none ${phase === "closing" ? "translate-y-full opacity-0 pointer-events-none" : "translate-y-0 opacity-100"}`}
      aria-label={isBg ? "Разширен плейър" : "Expanded now playing workspace"}
    >
      <div className="mx-auto flex h-full min-h-0 max-w-7xl flex-col border-x border-t border-border bg-surface/95 backdrop-blur-xl">
        <header className="flex items-center justify-between border-b border-border px-3 py-2 md:px-4">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.12em] text-text-muted">{isBg ? "Плейър" : "Now Playing"}</p>
            <p className="truncate text-sm font-semibold text-[var(--text)]">{currentTrack.title} · {currentTrack.artist}</p>
          </div>
          <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full bg-[var(--surface-subtle)]" aria-label={isBg ? "Свий плейъра" : "Collapse player workspace"}><ChevronDown className="h-5 w-5 text-[var(--text)]" /></button>
        </header>

        <div className="grid min-h-0 flex-1 gap-2 p-2 md:grid-cols-[minmax(220px,250px)_minmax(0,1fr)] md:p-3 xl:grid-cols-[minmax(220px,250px)_minmax(0,1fr)_minmax(300px,360px)]">
          <aside className="hidden min-h-0 rounded-xl bg-[var(--surface-subtle)] p-3 md:block">
            {currentTrack.artworkUrl ? <img src={currentTrack.artworkUrl} alt={isBg ? "Обложка" : "Artwork"} className="h-44 w-full rounded-lg object-cover" /> : <div className="h-44 w-full rounded-lg bg-[var(--surface-raised)]" />}
            <p className="mt-3 line-clamp-2 text-base font-semibold text-[var(--text)]">{currentTrack.title}</p>
            <p className="mt-1 text-sm text-text-muted">{currentTrack.artist}</p>
          </aside>

          <main className="flex min-h-0 flex-col rounded-xl bg-[var(--surface-subtle)] p-2 md:p-3">
            <div className="overflow-hidden rounded-lg bg-black">
              <div ref={expandedVideoHostRef} className="aspect-video w-full" />
            </div>

            <div className="mt-2">
              <input type="range" min={0} max={100} step={0.1} value={progress} onChange={(event) => seekToPercent(Number(event.target.value))} className="h-8 w-full themed-progress" aria-label={isBg ? "Прогрес" : "Track progress"} />
              <div className="mt-1 flex items-center justify-between text-xs text-text-muted"><span>{formatPlayerTime(currentTime)}</span><span>{formatPlayerTime(duration)}</span></div>
            </div>

            <div className="mt-2 grid grid-cols-3 gap-2 rounded-xl bg-[var(--surface-raised)] p-1.5 md:grid-cols-[1fr_auto_1fr]">
              <div className="flex items-center justify-center gap-2 md:justify-end">
                <button onClick={cycleRepeatMode} className={`inline-flex h-10 w-10 items-center justify-center rounded-full ${repeatMode === "normal" ? "bg-[var(--surface)] text-[var(--muted)]" : "bg-[var(--accent-soft)] text-[var(--text)]"}`} aria-label={repeatLabel}><RotateCcw className="h-4 w-4" /></button>
                <button onClick={skipPrevious} className="grid h-10 w-10 place-items-center rounded-full bg-[var(--surface)]" aria-label="Previous"><SkipBack className="h-4 w-4 text-[var(--text)]" /></button>
              </div>
              <button onClick={togglePlayPause} className="grid h-10 place-items-center rounded-full bg-[var(--accent-soft)] md:h-12 md:w-12" aria-label={isPlaying ? (isBg ? "Пауза" : "Pause playback") : (isBg ? "Пусни" : "Start playback")}>{isPlaying ? <Pause className="h-5 w-5 text-[var(--text)]" /> : <Play className="h-5 w-5 text-[var(--text)]" />}</button>
              <div className="flex items-center justify-center gap-2 md:justify-start">
                <button onClick={skipNext} className="grid h-10 w-10 place-items-center rounded-full bg-[var(--surface)]" aria-label="Next"><SkipForward className="h-4 w-4 text-[var(--text)]" /></button>
                <div className="relative">
                  <button onClick={() => setIsVolumePanelOpen((prev) => !prev)} className="grid h-10 w-10 place-items-center rounded-full bg-[var(--surface)]" aria-label={isBg ? "Сила на звука" : "Volume controls"}>{volume === 0 ? <VolumeX className="h-4 w-4 text-[var(--muted)]" /> : <Volume2 className="h-4 w-4 text-[var(--text)]" />}</button>
                  {isVolumePanelOpen ? (
                    <div className="absolute bottom-[calc(100%+8px)] right-0 z-30 rounded-xl border border-border bg-[var(--surface)] p-3">
                      <button type="button" onClick={toggleMute} className="mb-2 w-full rounded-lg bg-[var(--surface-subtle)] px-2 py-1 text-xs text-[var(--text)]">{volume === 0 ? (isBg ? "Включи звук" : "Unmute") : (isBg ? "Изключи звук" : "Mute")}</button>
                      <input type="range" min={0} max={100} value={volume} onChange={(event) => updateVolume(Number(event.target.value))} className="h-24 w-8 accent-[var(--accent)]" aria-label={isBg ? "Сила на звука" : "Volume"} />
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
            {playerError ? <p className="mt-2 text-xs status-danger">{playerError}</p> : null}

            <div className="mt-2 app-tabs xl:hidden">
              <button onClick={() => onWorkspaceTabChange("queue")} className={`app-tab inline-flex items-center justify-center gap-1 text-xs ${workspaceTab === "queue" ? "app-tab-active" : ""}`}><ListMusic className="h-3.5 w-3.5" />{isBg ? "Опашка" : "Queue"}</button>
              <button onClick={() => onWorkspaceTabChange("assistant")} className={`app-tab inline-flex items-center justify-center gap-1 text-xs ${workspaceTab === "assistant" ? "app-tab-active" : ""}`}><Sparkles className="h-3.5 w-3.5" />AI</button>
              <button onClick={() => onWorkspaceTabChange("context")} className={`app-tab inline-flex items-center justify-center gap-1 text-xs ${workspaceTab === "context" ? "app-tab-active" : ""}`}><Keyboard className="h-3.5 w-3.5" />{isBg ? "Контекст" : "Context"}</button>
            </div>
            <div className="mt-2 min-h-0 flex-1 overflow-auto rounded-xl bg-[var(--surface-raised)] p-2 xl:hidden">
              {workspaceTab === "queue" ? <QueuePanel /> : null}
              {workspaceTab === "assistant" ? <MusicAssistantPage mode="sidebar" sidebarOpen={isOpen} /> : null}
              {workspaceTab === "context" ? (
                <div className="rounded-xl bg-[var(--surface)] p-4">
                  <p className="text-xs uppercase tracking-[0.1em] text-text-muted">{isBg ? "Текущ контекст" : "Current context"}</p>
                  <p className="mt-2 text-lg font-semibold">{currentTrack.title}</p>
                  <p className="text-sm text-text-muted">{currentTrack.artist}</p>
                  <a className="mt-4 inline-block text-sm underline" href={youtubeSearchUrl} target="_blank" rel="noreferrer">{isBg ? "Отвори в YouTube" : "Open in YouTube"}</a>
                </div>
              ) : null}
            </div>
          </main>

          <aside className="hidden min-h-0 flex-col rounded-xl bg-[var(--surface-subtle)] p-3 xl:flex">
            <div className="app-tabs">
              <button onClick={() => onWorkspaceTabChange("queue")} className={`app-tab inline-flex items-center justify-center gap-1 text-xs ${workspaceTab === "queue" ? "app-tab-active" : ""}`}><ListMusic className="h-3.5 w-3.5" />{isBg ? "Опашка" : "Queue"}</button>
              <button onClick={() => onWorkspaceTabChange("assistant")} className={`app-tab inline-flex items-center justify-center gap-1 text-xs ${workspaceTab === "assistant" ? "app-tab-active" : ""}`}><Sparkles className="h-3.5 w-3.5" />AI</button>
              <button onClick={() => onWorkspaceTabChange("context")} className={`app-tab inline-flex items-center justify-center gap-1 text-xs ${workspaceTab === "context" ? "app-tab-active" : ""}`}><Keyboard className="h-3.5 w-3.5" />{isBg ? "Контекст" : "Context"}</button>
            </div>
            <div className="mt-3 min-h-0 flex-1 overflow-auto">
              {workspaceTab === "queue" ? <QueuePanel /> : null}
              {workspaceTab === "assistant" ? <MusicAssistantPage mode="sidebar" sidebarOpen={isOpen} /> : null}
              {workspaceTab === "context" ? (
                <div className="rounded-xl bg-[var(--surface)] p-4">
                  <p className="text-xs uppercase tracking-[0.1em] text-text-muted">{isBg ? "Текущ контекст" : "Current context"}</p>
                  <p className="mt-2 text-lg font-semibold">{currentTrack.title}</p>
                  <p className="text-sm text-text-muted">{currentTrack.artist}</p>
                  <a className="mt-4 inline-block text-sm underline" href={youtubeSearchUrl} target="_blank" rel="noreferrer">{isBg ? "Отвори в YouTube" : "Open in YouTube"}</a>
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
