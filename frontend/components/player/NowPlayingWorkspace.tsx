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

  const isClosing = phase === "closing";

  return (
    <section
      className={`h-full min-h-0 bg-[var(--surface)] transition-all duration-200 motion-reduce:transition-none ${isClosing ? "translate-y-full opacity-0" : "translate-y-0 opacity-100"}`}
      aria-label={isBg ? "Разширен плейър" : "Expanded now playing workspace"}
    >
      <div className="mx-auto flex h-full min-h-0 max-w-7xl flex-col px-3 pb-3 pt-[max(8px,env(safe-area-inset-top,0px))] md:px-4 md:pb-4 md:pt-3">
        <header className="mb-2 flex items-center justify-between rounded-xl border border-border bg-[var(--surface-subtle)] px-3 py-2">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.12em] text-text-muted">{isBg ? "Плейър" : "Now Playing"}</p>
            <p className="truncate text-sm font-semibold text-[var(--text)]">{currentTrack.title} · {currentTrack.artist}</p>
          </div>
          <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full bg-[var(--surface-raised)]" aria-label={isBg ? "Свий плейъра" : "Collapse player workspace"}><ChevronDown className="h-5 w-5 text-[var(--text)]" /></button>
        </header>

        <div className="hidden min-h-0 flex-1 gap-3 md:grid md:grid-cols-[minmax(220px,250px)_minmax(0,1fr)] xl:grid-cols-[minmax(220px,250px)_minmax(0,1fr)_minmax(300px,360px)]">
          <aside className="min-h-0 rounded-xl border border-border bg-[var(--surface-subtle)] p-3">
            <div className="space-y-3">
              {currentTrack.artworkUrl ? <img src={currentTrack.artworkUrl} alt={isBg ? "Обложка" : "Artwork"} className="h-48 w-full rounded-lg object-cover" /> : <div className="h-48 w-full rounded-lg bg-[var(--surface-raised)]" />}
              <div>
                <p className="line-clamp-2 text-base font-semibold text-[var(--text)]">{currentTrack.title}</p>
                <p className="mt-1 text-sm text-text-muted">{currentTrack.artist}</p>
              </div>
            </div>
          </aside>

          <main className="min-h-0 rounded-xl border border-border bg-[var(--surface-subtle)] p-3">
            <div className="flex h-full min-h-0 flex-col">
              <div className="overflow-hidden rounded-lg bg-black">
                <div ref={expandedVideoHostRef} className="aspect-video w-full" />
              </div>

              <div className="mt-3">
                <input type="range" min={0} max={100} step={0.1} value={progress} onChange={(event) => seekToPercent(Number(event.target.value))} className="h-8 w-full themed-progress" aria-label={isBg ? "Прогрес" : "Track progress"} />
                <div className="mt-1 flex items-center justify-between text-xs text-text-muted"><span>{formatPlayerTime(currentTime)}</span><span>{formatPlayerTime(duration)}</span></div>
              </div>

              <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl bg-[var(--surface-raised)] p-2">
                <div className="flex justify-end gap-2">
                  <button onClick={cycleRepeatMode} className={`inline-flex h-10 w-10 items-center justify-center rounded-full ${repeatMode === "normal" ? "bg-[var(--surface)] text-[var(--muted)]" : "bg-[var(--accent-soft)] text-[var(--text)]"}`} aria-label={repeatLabel}><RotateCcw className="h-4 w-4" /></button>
                  <button onClick={skipPrevious} className="grid h-10 w-10 place-items-center rounded-full bg-[var(--surface)]" aria-label="Previous"><SkipBack className="h-4 w-4 text-[var(--text)]" /></button>
                </div>
                <button onClick={togglePlayPause} className="grid h-12 w-12 place-items-center rounded-full bg-[var(--accent-soft)]" aria-label={isPlaying ? (isBg ? "Пауза" : "Pause playback") : (isBg ? "Пусни" : "Start playback")}>{isPlaying ? <Pause className="h-5 w-5 text-[var(--text)]" /> : <Play className="h-5 w-5 text-[var(--text)]" />}</button>
                <div className="flex items-center gap-2">
                  <button onClick={skipNext} className="grid h-10 w-10 place-items-center rounded-full bg-[var(--surface)]" aria-label="Next"><SkipForward className="h-4 w-4 text-[var(--text)]" /></button>
                  <div className="relative">
                    <button onClick={() => setIsVolumePanelOpen((prev) => !prev)} className="grid h-10 w-10 place-items-center rounded-full bg-[var(--surface)]" aria-label={isBg ? "Сила на звука" : "Volume controls"}>{volume === 0 ? <VolumeX className="h-4 w-4 text-[var(--muted)]" /> : <Volume2 className="h-4 w-4 text-[var(--text)]" />}</button>
                    {isVolumePanelOpen ? (
                      <div className="absolute bottom-[calc(100%+8px)] right-0 z-30 rounded-xl border border-border bg-[var(--surface)] p-3">
                        <button type="button" onClick={toggleMute} className="mb-2 w-full rounded-lg bg-[var(--surface-subtle)] px-2 py-1 text-xs text-[var(--text)]">
                          {volume === 0 ? (isBg ? "Включи звук" : "Unmute") : (isBg ? "Изключи звук" : "Mute")}
                        </button>
                        <input type="range" min={0} max={100} value={volume} onChange={(event) => updateVolume(Number(event.target.value))} className="h-28 w-8 accent-[var(--accent)]" aria-label={isBg ? "Сила на звука" : "Volume"} />
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
              {playerError ? <p className="mt-2 text-xs status-danger">{playerError}</p> : null}
            </div>
          </main>

          <aside className="hidden min-h-0 rounded-xl border border-border bg-[var(--surface-subtle)] p-3 xl:flex xl:flex-col">
            <div className="app-tabs">
              <button onClick={() => onWorkspaceTabChange("queue")} className={`app-tab inline-flex items-center justify-center gap-1 text-xs ${workspaceTab === "queue" ? "app-tab-active" : ""}`}><ListMusic className="h-3.5 w-3.5" />{isBg ? "Опашка" : "Queue"}</button>
              <button onClick={() => onWorkspaceTabChange("assistant")} className={`app-tab inline-flex items-center justify-center gap-1 text-xs ${workspaceTab === "assistant" ? "app-tab-active" : ""}`}><Sparkles className="h-3.5 w-3.5" />AI</button>
              <button onClick={() => onWorkspaceTabChange("context")} className={`app-tab inline-flex items-center justify-center gap-1 text-xs ${workspaceTab === "context" ? "app-tab-active" : ""}`}><Keyboard className="h-3.5 w-3.5" />{isBg ? "Контекст" : "Context"}</button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto pt-3">
              {workspaceTab === "queue" ? <QueuePanel /> : null}
              {workspaceTab === "assistant" ? <MusicAssistantPage mode="sidebar" sidebarOpen={isOpen} /> : null}
              {workspaceTab === "context" ? (
                <div className="rounded-xl border border-border bg-[var(--surface)] p-4">
                  <p className="text-xs uppercase tracking-[0.1em] text-text-muted">{isBg ? "Текущ контекст" : "Current context"}</p>
                  <p className="mt-2 text-lg font-semibold">{currentTrack.title}</p>
                  <p className="text-sm text-text-muted">{currentTrack.artist}</p>
                  <a className="mt-4 inline-block text-sm underline" href={youtubeSearchUrl} target="_blank" rel="noreferrer">{isBg ? "Отвори в YouTube" : "Open in YouTube"}</a>
                </div>
              ) : null}
            </div>
          </aside>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2 md:hidden">
          <div className="overflow-hidden rounded-lg border border-border bg-black">
            <div ref={expandedVideoHostRef} className="aspect-video w-full" />
          </div>
          <div>
            <input type="range" min={0} max={100} step={0.1} value={progress} onChange={(event) => seekToPercent(Number(event.target.value))} className="h-8 w-full themed-progress" aria-label={isBg ? "Прогрес" : "Track progress"} />
            <div className="mt-1 flex items-center justify-between text-xs text-text-muted"><span>{formatPlayerTime(currentTime)}</span><span>{formatPlayerTime(duration)}</span></div>
          </div>
          <div className="grid grid-cols-3 gap-2 rounded-xl border border-border bg-[var(--surface-subtle)] p-1.5">
            <button onClick={skipPrevious} className="grid h-10 place-items-center rounded-full" aria-label="Previous"><SkipBack className="h-5 w-5 text-[var(--text)]" /></button>
            <button onClick={togglePlayPause} className="grid h-10 place-items-center rounded-full bg-[var(--accent-soft)]" aria-label={isPlaying ? (isBg ? "Пауза" : "Pause playback") : (isBg ? "Пусни" : "Start playback")}>{isPlaying ? <Pause className="h-5 w-5 text-[var(--text)]" /> : <Play className="h-5 w-5 text-[var(--text)]" />}</button>
            <button onClick={skipNext} className="grid h-10 place-items-center rounded-full" aria-label="Next"><SkipForward className="h-5 w-5 text-[var(--text)]" /></button>
          </div>
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-[var(--surface-subtle)] p-1.5">
            <button onClick={cycleRepeatMode} className={`inline-flex h-10 items-center justify-center rounded-full ${repeatMode === "normal" ? "bg-[var(--surface)] text-[var(--muted)]" : "bg-[var(--accent-soft)] text-[var(--text)]"}`} aria-label={repeatLabel}><RotateCcw className="h-4 w-4" /></button>
            <div className="relative">
              <button onClick={() => setIsVolumePanelOpen((prev) => !prev)} className="grid h-10 w-full place-items-center rounded-full bg-[var(--surface)]" aria-label={isBg ? "Сила на звука" : "Volume controls"}>{volume === 0 ? <VolumeX className="h-4 w-4 text-[var(--muted)]" /> : <Volume2 className="h-4 w-4 text-[var(--text)]" />}</button>
              {isVolumePanelOpen ? (
                <div className="absolute bottom-[calc(100%+8px)] right-0 z-30 rounded-xl border border-border bg-[var(--surface)] p-3">
                  <button type="button" onClick={toggleMute} className="mb-2 w-full rounded-lg bg-[var(--surface-subtle)] px-2 py-1 text-xs text-[var(--text)]">
                    {volume === 0 ? (isBg ? "Включи звук" : "Unmute") : (isBg ? "Изключи звук" : "Mute")}
                  </button>
                  <input type="range" min={0} max={100} value={volume} onChange={(event) => updateVolume(Number(event.target.value))} className="h-24 w-8 accent-[var(--accent)]" aria-label={isBg ? "Сила на звука" : "Volume"} />
                </div>
              ) : null}
            </div>
          </div>

          <div className="app-tabs">
            <button onClick={() => onWorkspaceTabChange("queue")} className={`app-tab inline-flex items-center justify-center gap-1 text-xs ${workspaceTab === "queue" ? "app-tab-active" : ""}`}><ListMusic className="h-3.5 w-3.5" />{isBg ? "Опашка" : "Queue"}</button>
            <button onClick={() => onWorkspaceTabChange("assistant")} className={`app-tab inline-flex items-center justify-center gap-1 text-xs ${workspaceTab === "assistant" ? "app-tab-active" : ""}`}><Sparkles className="h-3.5 w-3.5" />AI</button>
            <button onClick={() => onWorkspaceTabChange("context")} className={`app-tab inline-flex items-center justify-center gap-1 text-xs ${workspaceTab === "context" ? "app-tab-active" : ""}`}><Keyboard className="h-3.5 w-3.5" />{isBg ? "Контекст" : "Context"}</button>
          </div>

          <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-[var(--surface-subtle)] p-3">
            {workspaceTab === "queue" ? <QueuePanel /> : null}
            {workspaceTab === "assistant" ? <MusicAssistantPage mode="sidebar" sidebarOpen={isOpen} /> : null}
            {workspaceTab === "context" ? (
              <div className="rounded-xl border border-border bg-[var(--surface)] p-4">
                <p className="text-xs uppercase tracking-[0.1em] text-text-muted">{isBg ? "Текущ контекст" : "Current context"}</p>
                <p className="mt-2 text-lg font-semibold">{currentTrack.title}</p>
                <p className="text-sm text-text-muted">{currentTrack.artist}</p>
                <a className="mt-4 inline-block text-sm underline" href={youtubeSearchUrl} target="_blank" rel="noreferrer">{isBg ? "Отвори в YouTube" : "Open in YouTube"}</a>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
