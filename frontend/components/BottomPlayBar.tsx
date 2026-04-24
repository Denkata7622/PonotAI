"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Keyboard, ListMusic, Pause, Play, RotateCcw, SkipBack, SkipForward, Volume2, VolumeX, X, Sparkles } from "lucide-react";
import { usePlayer } from "./PlayerProvider";
import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/translations";
import { useDualSidebar } from "@/src/components/sidebars/DualSidebarContext";
import QueuePanel from "@/src/components/player/QueuePanel";
import MusicAssistantPage from "@/src/features/assistant/components/MusicAssistantPage";

type WorkspaceTab = "queue" | "assistant" | "context";

function formatTime(seconds: number) {
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const minutes = Math.floor(safe / 60).toString().padStart(2, "0");
  const secs = (safe % 60).toString().padStart(2, "0");
  return `${minutes}:${secs}`;
}

export default function BottomPlayBar() {
  const { language } = useLanguage();
  const isBg = language === "bg";
  const [isNowPlayingOpen, setIsNowPlayingOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [lastVolume, setLastVolume] = useState(70);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("queue");
  const playerBarRef = useRef<HTMLDivElement | null>(null);
  const collapsedVideoHostRef = useRef<HTMLDivElement | null>(null);
  const expandedVideoHostRef = useRef<HTMLDivElement | null>(null);
  const youtubeMountRef = useRef<HTMLDivElement | null>(null);

  const {
    queue,
    currentTrack,
    currentVideoId,
    isPlaying,
    currentTime,
    duration,
    volume,
    isInitializing,
    isBuffering,
    playerError,
    togglePlayPause,
    seekToPercent,
    setVolume,
    skipNext,
    skipPrevious,
    repeatMode,
    cycleRepeatMode,
  } = usePlayer();

  const { state: sidebarState, closePanel } = useDualSidebar();
  const progress = useMemo(() => (duration ? Math.min(100, (currentTime / duration) * 100) : 0), [currentTime, duration]);
  const repeatLabel = repeatMode === "normal"
    ? (isBg ? "Без повторение" : "Repeat off")
    : repeatMode === "queue"
      ? (isBg ? "Повтаряне на опашката" : "Repeat queue")
      : (isBg ? "Повтаряне на песента" : "Repeat track");
  const youtubeSearchUrl = currentTrack
    ? `https://www.youtube.com/results?search_query=${encodeURIComponent(`${currentTrack.title} ${currentTrack.artist}`)}`
    : "#";

  useEffect(() => {
    const updatePlayerBarHeight = () => {
      const height = playerBarRef.current?.getBoundingClientRect().height ?? 0;
      document.documentElement.style.setProperty("--player-bar-height", `${Math.round(height)}px`);
    };

    updatePlayerBarHeight();
    window.addEventListener("resize", updatePlayerBarHeight);
    const observer = new ResizeObserver(updatePlayerBarHeight);
    if (playerBarRef.current) observer.observe(playerBarRef.current);

    return () => {
      window.removeEventListener("resize", updatePlayerBarHeight);
      observer.disconnect();
      document.documentElement.style.setProperty("--player-bar-height", "88px");
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.nowPlayingOpen = isNowPlayingOpen ? "true" : "false";
    window.dispatchEvent(new CustomEvent("ponotai:now-playing-visibility", { detail: { open: isNowPlayingOpen } }));
    return () => {
      document.documentElement.dataset.nowPlayingOpen = "false";
    };
  }, [isNowPlayingOpen]);

  useEffect(() => {
    if (!currentTrack || !currentVideoId) {
      setIsNowPlayingOpen(false);
    }
  }, [currentTrack, currentVideoId]);

  function toggleMute() {
    if (volume === 0) {
      setVolume(lastVolume || 70);
      return;
    }
    setLastVolume(volume);
    setVolume(0);
  }

  function handleQueueClick() {
    if (!isNowPlayingOpen) setIsNowPlayingOpen(true);
    setWorkspaceTab("queue");
  }

  function handleAssistantClick() {
    if (!isNowPlayingOpen) setIsNowPlayingOpen(true);
    setWorkspaceTab("assistant");
  }

  const sharedVolumeSlider = (
    <div className="absolute bottom-[calc(100%+8px)] right-0 z-[72] rounded-xl border border-border bg-[var(--surface)] p-3 shadow-xl">
      <input
        type="range"
        min={0}
        max={100}
        value={volume}
        onChange={(event) => setVolume(Number(event.target.value))}
        className="h-28 w-8 accent-[var(--accent)]"
        aria-label={isBg ? "Сила на звука" : "Volume"}
      />
    </div>
  );

  return (
    <>
      {isNowPlayingOpen && currentTrack && currentVideoId && (
        <button
          className="fixed inset-0 z-[55] bg-black/55"
          aria-label={isBg ? "Затвори изгледа" : "Close now playing"}
          onClick={() => setIsNowPlayingOpen(false)}
        />
      )}

      {isShortcutsOpen && (
        <div className="fixed inset-0 z-[70] bg-black/60" onClick={() => setIsShortcutsOpen(false)}>
          <div className="mx-auto mt-24 w-[92%] max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold">{t("shortcuts_title", language)}</h3>
              <button onClick={() => setIsShortcutsOpen(false)} aria-label="Close shortcuts"><X className="h-5 w-5 text-[var(--muted)]" /></button>
            </div>
            <div className="space-y-2 text-sm">
              {[
                { key: "Space", label: t("shortcut_play_pause", language) },
                { key: "→", label: t("shortcut_next", language) },
                { key: "←", label: t("shortcut_previous", language) },
                { key: "M", label: t("shortcut_mute", language) },
                { key: "/", label: t("shortcut_focus_search", language) },
              ].map((item) => (
                <div key={item.key} className="flex items-center justify-between rounded-lg border border-border bg-[var(--surface-raised)] px-3 py-2">
                  <kbd className="rounded border border-border bg-[var(--surface)] px-2 py-1 text-xs">{item.key}</kbd>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {isNowPlayingOpen && currentTrack && currentVideoId ? (
        <section className="fixed inset-0 z-[60] flex flex-col bg-[var(--surface)]">
          <div className="flex items-center justify-between border-b border-border px-4 py-[calc(10px+env(safe-area-inset-top,0px))] md:px-6">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.12em] text-text-muted">{isBg ? "Сега звучи" : "Now Playing"}</p>
              <p className="truncate text-sm font-semibold text-[var(--text)]">{currentTrack.title} · {currentTrack.artist}</p>
            </div>
            <button onClick={() => setIsNowPlayingOpen(false)} className="grid h-10 w-10 place-items-center rounded-full border border-border" aria-label={isBg ? "Затвори" : "Close"}><X className="h-5 w-5 text-[var(--text)]" /></button>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(240px,280px)_minmax(0,1fr)_minmax(320px,420px)]">
            <aside className="hidden border-r border-border p-4 md:block">
              <div className="rounded-2xl border border-border bg-[var(--surface-raised)] p-4">
                {currentTrack.artworkUrl ? <img src={currentTrack.artworkUrl} alt={isBg ? "Обложка" : "Artwork"} className="mb-3 h-52 w-full rounded-xl object-cover" /> : <div className="mb-3 h-52 w-full rounded-xl bg-[var(--surface)]" />}
                <p className="text-lg font-semibold">{currentTrack.title}</p>
                <p className="text-sm text-text-muted">{currentTrack.artist}</p>
                <button onClick={setIsShortcutsOpen.bind(null, true)} className="mt-4 inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs"><Keyboard className="h-3.5 w-3.5" />{t("shortcuts_title", language)}</button>
              </div>
            </aside>

            <main className="flex min-h-0 flex-col px-4 pb-4 pt-3 md:px-6 md:pb-6">
              <div className="overflow-hidden rounded-2xl border border-border bg-black shadow-xl">
                <div ref={expandedVideoHostRef} className="aspect-video w-full" />
              </div>

              <div className="mt-4">
                <input type="range" min={0} max={100} step={0.1} value={progress} onChange={(event) => seekToPercent(Number(event.target.value))} className="h-8 w-full themed-progress" aria-label={isBg ? "Прогрес" : "Track progress"} />
                <div className="mt-1 flex items-center justify-between text-xs text-text-muted">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
                <div className="flex justify-end gap-2">
                  <button onClick={cycleRepeatMode} className={`inline-flex h-11 w-11 items-center justify-center rounded-full border ${repeatMode === "normal" ? "border-border text-[var(--muted)]" : "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--text)]"}`} aria-label={repeatLabel}><RotateCcw className="h-4 w-4" /></button>
                  <button onClick={skipPrevious} className="grid h-11 w-11 place-items-center rounded-full border border-border" aria-label="Previous"><SkipBack className="h-4 w-4 text-[var(--text)]" /></button>
                </div>
                <button onClick={togglePlayPause} className="grid h-14 w-14 place-items-center rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)]" aria-label={isPlaying ? (isBg ? "Пауза" : "Pause playback") : (isBg ? "Пусни" : "Start playback")}>{isPlaying ? <Pause className="h-6 w-6 text-[var(--text)]" /> : <Play className="h-6 w-6 text-[var(--text)]" />}</button>
                <div className="flex items-center gap-2">
                  <button onClick={skipNext} className="grid h-11 w-11 place-items-center rounded-full border border-border" aria-label="Next"><SkipForward className="h-4 w-4 text-[var(--text)]" /></button>
                  <div className="relative">
                    <button onClick={() => setShowVolumeSlider((prev) => !prev)} className="grid h-11 w-11 place-items-center rounded-full border border-border" aria-label={volume === 0 ? "Unmute" : "Mute"}>{volume === 0 ? <VolumeX className="h-4 w-4 text-[var(--muted)]" /> : <Volume2 className="h-4 w-4 text-[var(--text)]" />}</button>
                    {showVolumeSlider ? sharedVolumeSlider : null}
                  </div>
                </div>
              </div>
              {playerError ? <p className="mt-3 text-xs status-danger">{playerError}</p> : null}
            </main>

            <aside className="flex min-h-0 flex-col border-t border-border md:border-l md:border-t-0">
              <div className="grid grid-cols-3 border-b border-border p-2">
                {[
                  { key: "queue", icon: ListMusic, label: isBg ? "Опашка" : "Queue" },
                  { key: "assistant", icon: Sparkles, label: "AI" },
                  { key: "context", icon: Keyboard, label: isBg ? "Контекст" : "Context" },
                ].map((tab) => {
                  const Icon = tab.icon;
                  const active = workspaceTab === tab.key;
                  return (
                    <button key={tab.key} onClick={() => setWorkspaceTab(tab.key as WorkspaceTab)} className={`inline-flex items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs ${active ? "bg-[var(--accent-soft)] text-[var(--text)]" : "text-text-muted"}`}>
                      <Icon className="h-3.5 w-3.5" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">
                {workspaceTab === "queue" ? <QueuePanel /> : null}
                {workspaceTab === "assistant" ? <MusicAssistantPage mode="sidebar" sidebarOpen={isNowPlayingOpen} /> : null}
                {workspaceTab === "context" ? (
                  <div className="h-full overflow-auto p-4">
                    <div className="rounded-2xl border border-border bg-[var(--surface-raised)] p-4">
                      <p className="text-xs uppercase tracking-[0.1em] text-text-muted">{isBg ? "Текущ контекст" : "Current context"}</p>
                      <p className="mt-2 text-lg font-semibold">{currentTrack.title}</p>
                      <p className="text-sm text-text-muted">{currentTrack.artist}</p>
                      <a className="mt-4 inline-block text-sm underline" href={youtubeSearchUrl} target="_blank" rel="noreferrer">{isBg ? "Отвори в YouTube" : "Open in YouTube"}</a>
                    </div>
                  </div>
                ) : null}
              </div>
            </aside>
          </div>
        </section>
      ) : null}

      <div
        ref={playerBarRef}
        data-player-bar
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-[var(--surface)] px-2 pb-[calc(8px+env(safe-area-inset-bottom,0px))] pt-2 backdrop-blur-xl sm:px-4"
      >
        <div className="mx-auto max-w-7xl">
          {!currentTrack || !currentVideoId ? (
            <div className="rounded-xl border border-dashed border-border bg-[var(--surface-raised)] px-4 py-2 text-xs text-text-muted">
              {!currentTrack
                ? (isBg ? "Избери песен, за да стартираш плейъра." : "Choose a track to start playback.")
                : (isInitializing || isBuffering
                  ? (isBg ? "Подготвяне на видео…" : "Preparing video…")
                  : <span>
                      {isBg ? "Възпроизвеждането е недостъпно — отвори в YouTube." : "Playback unavailable — open on YouTube."}{" "}
                      <a className="underline" href={youtubeSearchUrl} target="_blank" rel="noreferrer">{isBg ? "Отвори търсене" : "Open search"}</a>
                    </span>)}
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-[var(--surface-raised)] p-2">
              <div className="grid grid-cols-[minmax(0,1fr)_90px] items-center gap-2 md:grid-cols-[auto_minmax(220px,1fr)_auto_96px]">
                <button type="button" onClick={() => setIsNowPlayingOpen(true)} className="flex min-w-0 items-center gap-2 text-left">
                  {currentTrack.artworkUrl ? (
                    <img src={currentTrack.artworkUrl} alt={isBg ? "Обложка" : "Artwork"} className="h-11 w-11 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <div className="h-11 w-11 shrink-0 rounded-lg bg-[var(--surface)]" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--text)]">{currentTrack.title}</p>
                    <p className="truncate text-xs text-text-muted">{currentTrack.artist}</p>
                  </div>
                </button>

                <div className="hidden items-center gap-1 md:flex">
                  <button onClick={skipPrevious} className="grid h-9 w-9 place-items-center rounded-full border border-border" aria-label="Previous"><SkipBack className="h-4 w-4 text-[var(--text)]" /></button>
                  <button onClick={togglePlayPause} className="grid h-10 w-10 place-items-center rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)]" aria-label={isPlaying ? (isBg ? "Пауза" : "Pause playback") : (isBg ? "Пусни" : "Start playback")}>{isPlaying ? <Pause className="h-4 w-4 text-[var(--text)]" /> : <Play className="h-4 w-4 text-[var(--text)]" />}</button>
                  <button onClick={skipNext} className="grid h-9 w-9 place-items-center rounded-full border border-border" aria-label="Next"><SkipForward className="h-4 w-4 text-[var(--text)]" /></button>
                  <button onClick={cycleRepeatMode} className={`grid h-9 w-9 place-items-center rounded-full border ${repeatMode === "normal" ? "border-border text-[var(--muted)]" : "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--text)]"}`} aria-label={repeatLabel}><RotateCcw className="h-4 w-4" /></button>
                  <button data-testid="queue-toggle-dock" onClick={handleQueueClick} className="relative grid h-9 w-9 place-items-center rounded-full border border-border" aria-label="Queue"><ListMusic className="h-4 w-4 text-[var(--text)]" />{queue.length > 0 ? <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--accent)] px-1 text-[10px] text-white">{queue.length}</span> : null}</button>
                  <button onClick={handleAssistantClick} className="grid h-9 w-9 place-items-center rounded-full border border-border" aria-label="AI assistant"><Sparkles className="h-4 w-4 text-[var(--text)]" /></button>
                  <div className="relative">
                    <button onClick={() => setShowVolumeSlider((prev) => !prev)} className="grid h-9 w-9 place-items-center rounded-full border border-border" aria-label={volume === 0 ? "Unmute" : "Mute"}>{volume === 0 ? <VolumeX className="h-4 w-4 text-[var(--muted)]" /> : <Volume2 className="h-4 w-4 text-[var(--text)]" />}</button>
                    {showVolumeSlider ? sharedVolumeSlider : null}
                  </div>
                  <button onClick={() => setIsNowPlayingOpen(true)} className="grid h-9 w-9 place-items-center rounded-full border border-border" aria-label={isBg ? "Разгъни" : "Expand now playing"}><ChevronDown className="h-4 w-4 rotate-180 text-[var(--text)]" /></button>
                </div>

                <div className="h-14 overflow-hidden rounded-xl border border-border bg-black">
                  <div ref={collapsedVideoHostRef} className="h-full w-full" />
                </div>
              </div>

              <div className="mt-2 flex items-center gap-2 text-xs text-text-muted">
                <span className="w-10 shrink-0 text-right">{formatTime(currentTime)}</span>
                <input type="range" min={0} max={100} step={0.1} value={progress} onChange={(event) => seekToPercent(Number(event.target.value))} className="h-7 min-w-0 flex-1 themed-progress" aria-label={isBg ? "Прогрес" : "Track progress"} />
                <span className="w-10 shrink-0">{formatTime(duration)}</span>
              </div>

              <div className="mt-2 grid grid-cols-8 gap-1 md:hidden">
                <button onClick={skipPrevious} className="grid h-10 place-items-center rounded-full border border-border" aria-label="Previous"><SkipBack className="h-4 w-4 text-[var(--text)]" /></button>
                <button onClick={togglePlayPause} className="grid h-10 place-items-center rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)]" aria-label={isPlaying ? (isBg ? "Пауза" : "Pause playback") : (isBg ? "Пусни" : "Start playback")}>{isPlaying ? <Pause className="h-4 w-4 text-[var(--text)]" /> : <Play className="h-4 w-4 text-[var(--text)]" />}</button>
                <button onClick={skipNext} className="grid h-10 place-items-center rounded-full border border-border" aria-label="Next"><SkipForward className="h-4 w-4 text-[var(--text)]" /></button>
                <button onClick={cycleRepeatMode} className={`grid h-10 place-items-center rounded-full border ${repeatMode === "normal" ? "border-border text-[var(--muted)]" : "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--text)]"}`} aria-label={repeatLabel}><RotateCcw className="h-4 w-4" /></button>
                <button onClick={handleQueueClick} className="relative grid h-10 place-items-center rounded-full border border-border" aria-label="Queue"><ListMusic className="h-4 w-4 text-[var(--text)]" />{queue.length > 0 ? <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--accent)] px-1 text-[10px] text-white">{queue.length}</span> : null}</button>
                <div className="relative">
                  <button onClick={() => setShowVolumeSlider((prev) => !prev)} className="grid h-10 w-full place-items-center rounded-full border border-border" aria-label={volume === 0 ? "Unmute" : "Mute"}>{volume === 0 ? <VolumeX className="h-4 w-4 text-[var(--muted)]" /> : <Volume2 className="h-4 w-4 text-[var(--text)]" />}</button>
                  {showVolumeSlider ? sharedVolumeSlider : null}
                </div>
                <button onClick={handleAssistantClick} className="grid h-10 place-items-center rounded-full border border-border" aria-label="AI assistant"><Sparkles className="h-4 w-4 text-[var(--text)]" /></button>
                <button onClick={() => setIsNowPlayingOpen(true)} className="grid h-10 place-items-center rounded-full border border-border" aria-label={isBg ? "Разгъни" : "Expand now playing"}><ChevronDown className="h-4 w-4 rotate-180 text-[var(--text)]" /></button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
