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
  workspaceTab: WorkspaceTab;
  onWorkspaceTabChange: (tab: WorkspaceTab) => void;
  onClose: () => void;
  expandedVideoHostRef: RefObject<HTMLDivElement | null>;
};

export default function NowPlayingWorkspace({ workspaceTab, onWorkspaceTabChange, onClose, expandedVideoHostRef }: NowPlayingWorkspaceProps) {
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

  if (!currentTrack || !currentVideoId) return null;

  return (
    <section className="absolute inset-x-0 top-0 bottom-0 overflow-hidden px-2 pb-2 pt-[max(env(safe-area-inset-top,0px),8px)] sm:px-4 sm:pb-4" aria-label={isBg ? "Разширен плейър" : "Expanded now playing workspace"}>
      <div className="mx-auto flex h-full min-h-0 max-w-7xl flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
        <header className="border-b border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 sm:px-4">
          <div className="flex items-center gap-3">
            {currentTrack.artworkUrl ? (
              <img src={currentTrack.artworkUrl} alt={isBg ? "Обложка" : "Artwork"} className="h-11 w-11 shrink-0 rounded-lg object-cover" />
            ) : (
              <div className="h-11 w-11 shrink-0 rounded-lg bg-[var(--surface-subtle)]" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-[var(--text)]">{currentTrack.title}</p>
              <p className="truncate text-xs text-[var(--muted)]">{currentTrack.artist}</p>
            </div>
            <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full bg-[var(--surface-subtle)]" aria-label={isBg ? "Свий плейъра" : "Collapse now playing"}><ChevronDown className="h-5 w-5 text-[var(--text)]" /></button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 gap-2 p-2 md:grid-cols-[minmax(200px,260px)_minmax(0,1fr)] md:p-3 xl:grid-cols-[minmax(220px,280px)_minmax(0,1fr)_minmax(300px,360px)]">
          <aside className="hidden min-h-0 rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] p-3 md:block">
            <p className="text-xs uppercase tracking-[0.1em] text-[var(--muted)]">{isBg ? "Контекст" : "Context"}</p>
            <p className="mt-2 line-clamp-2 text-base font-semibold text-[var(--text)]">{currentTrack.title}</p>
            <p className="mt-1 text-sm text-[var(--muted)]">{currentTrack.artist}</p>
            <a className="mt-4 inline-block text-sm text-[var(--accent)] underline" href={youtubeSearchUrl} target="_blank" rel="noreferrer">{isBg ? "Отвори в YouTube" : "Open in YouTube"}</a>
          </aside>

          <main className="flex min-h-0 flex-col rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] p-2 md:p-3">
            <div className="overflow-hidden rounded-lg bg-black">
              <div ref={expandedVideoHostRef} className="aspect-video w-full" />
            </div>

            <div className="mt-2">
              <input type="range" min={0} max={100} step={0.1} value={progress} onChange={(event) => seekToPercent(Number(event.target.value))} className="h-8 w-full themed-progress" aria-label={isBg ? "Прогрес" : "Track progress"} />
              <div className="mt-1 flex items-center justify-between text-xs text-[var(--muted)]"><span>{formatPlayerTime(currentTime)}</span><span>{formatPlayerTime(duration)}</span></div>
            </div>

            <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-1.5">
              <div className="flex items-center justify-start gap-2">
                <button onClick={cycleRepeatMode} className={`inline-flex h-10 w-10 items-center justify-center rounded-full ${repeatMode === "normal" ? "bg-[var(--surface-subtle)] text-[var(--muted)]" : "bg-[var(--accent-soft)] text-[var(--text)]"}`} aria-label={repeatLabel}><RotateCcw className="h-4 w-4" /></button>
                <button onClick={skipPrevious} className="grid h-10 w-10 place-items-center rounded-full bg-[var(--surface-subtle)]" aria-label="Previous"><SkipBack className="h-4 w-4 text-[var(--text)]" /></button>
              </div>
              <button onClick={togglePlayPause} className="grid h-11 w-11 place-items-center rounded-full bg-[var(--accent-soft)]" aria-label={isPlaying ? (isBg ? "Пауза" : "Pause playback") : (isBg ? "Пусни" : "Start playback")}>{isPlaying ? <Pause className="h-5 w-5 text-[var(--text)]" /> : <Play className="h-5 w-5 text-[var(--text)]" />}</button>
              <div className="flex items-center justify-end gap-2">
                <button onClick={skipNext} className="grid h-10 w-10 place-items-center rounded-full bg-[var(--surface-subtle)]" aria-label="Next"><SkipForward className="h-4 w-4 text-[var(--text)]" /></button>
                <div className="relative">
                  <button onClick={() => setIsVolumePanelOpen((prev) => !prev)} className="grid h-10 w-10 place-items-center rounded-full bg-[var(--surface-subtle)]" aria-label={isBg ? "Сила на звука" : "Volume controls"}>{volume === 0 ? <VolumeX className="h-4 w-4 text-[var(--muted)]" /> : <Volume2 className="h-4 w-4 text-[var(--text)]" />}</button>
                  {isVolumePanelOpen ? (
                    <div className="absolute bottom-[calc(100%+8px)] right-0 z-30 w-56 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-2.5 shadow-xl">
                      <button type="button" onClick={toggleMute} className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface-subtle)] text-[var(--text)]" aria-label={volume === 0 ? (isBg ? "Включи звук" : "Unmute") : (isBg ? "Изключи звук" : "Mute")}>
                        {volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                      </button>
                      <div className="flex items-center gap-2">
                        <input type="range" min={0} max={100} value={volume} onChange={(event) => updateVolume(Number(event.target.value))} className="h-8 min-w-0 flex-1 accent-[var(--accent)]" aria-label={isBg ? "Сила на звука" : "Volume"} />
                        <span className="w-10 text-right text-xs text-[var(--muted)]">{Math.round(volume)}%</span>
                      </div>
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
            <div className="mt-2 min-h-0 flex-1 overflow-auto rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-2 xl:hidden">
              {workspaceTab === "queue" ? <QueuePanel /> : null}
              {workspaceTab === "assistant" ? <MusicAssistantPage mode="sidebar" sidebarOpen /> : null}
              {workspaceTab === "context" ? (
                <div className="rounded-xl bg-[var(--surface)] p-4">
                  <p className="text-xs uppercase tracking-[0.1em] text-[var(--muted)]">{isBg ? "Текущ контекст" : "Current context"}</p>
                  <p className="mt-2 text-lg font-semibold text-[var(--text)]">{currentTrack.title}</p>
                  <p className="text-sm text-[var(--muted)]">{currentTrack.artist}</p>
                  <a className="mt-4 inline-block text-sm text-[var(--accent)] underline" href={youtubeSearchUrl} target="_blank" rel="noreferrer">{isBg ? "Отвори в YouTube" : "Open in YouTube"}</a>
                </div>
              ) : null}
            </div>
          </main>

          <aside className="hidden min-h-0 flex-col rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] p-3 xl:flex">
            <div className="app-tabs">
              <button onClick={() => onWorkspaceTabChange("queue")} className={`app-tab inline-flex items-center justify-center gap-1 text-xs ${workspaceTab === "queue" ? "app-tab-active" : ""}`}><ListMusic className="h-3.5 w-3.5" />{isBg ? "Опашка" : "Queue"}</button>
              <button onClick={() => onWorkspaceTabChange("assistant")} className={`app-tab inline-flex items-center justify-center gap-1 text-xs ${workspaceTab === "assistant" ? "app-tab-active" : ""}`}><Sparkles className="h-3.5 w-3.5" />AI</button>
              <button onClick={() => onWorkspaceTabChange("context")} className={`app-tab inline-flex items-center justify-center gap-1 text-xs ${workspaceTab === "context" ? "app-tab-active" : ""}`}><Keyboard className="h-3.5 w-3.5" />{isBg ? "Контекст" : "Context"}</button>
            </div>
            <div className="mt-3 min-h-0 flex-1 overflow-auto rounded-xl bg-[var(--surface-raised)] p-2">
              {workspaceTab === "queue" ? <QueuePanel /> : null}
              {workspaceTab === "assistant" ? <MusicAssistantPage mode="sidebar" sidebarOpen /> : null}
              {workspaceTab === "context" ? (
                <div className="rounded-xl bg-[var(--surface)] p-4">
                  <p className="text-xs uppercase tracking-[0.1em] text-[var(--muted)]">{isBg ? "Текущ контекст" : "Current context"}</p>
                  <p className="mt-2 text-lg font-semibold text-[var(--text)]">{currentTrack.title}</p>
                  <p className="text-sm text-[var(--muted)]">{currentTrack.artist}</p>
                  <a className="mt-4 inline-block text-sm text-[var(--accent)] underline" href={youtubeSearchUrl} target="_blank" rel="noreferrer">{isBg ? "Отвори в YouTube" : "Open in YouTube"}</a>
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
