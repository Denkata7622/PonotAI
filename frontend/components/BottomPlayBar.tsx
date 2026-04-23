"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Keyboard, ListMusic, Pause, Play, RotateCcw, SkipBack, SkipForward, Volume2, VolumeX, X } from "lucide-react";
import { usePlayer } from "./PlayerProvider";
import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/translations";
import { useDualSidebar } from "@/src/components/sidebars/DualSidebarContext";

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
  const playerBarRef = useRef<HTMLDivElement | null>(null);

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

  const { state: sidebarState, togglePanel } = useDualSidebar();
  const isQueueOpen = sidebarState.open.queue;
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

  function toggleMute() {
    if (volume === 0) {
      setVolume(lastVolume || 70);
      return;
    }
    setLastVolume(volume);
    setVolume(0);
  }

  return (
    <>
      <div className="pointer-events-none fixed -left-[9999px] top-0 h-px w-px overflow-hidden" aria-hidden>
        <div id="ponotai-yt-player" className="h-full w-full" />
      </div>

      {isNowPlayingOpen && (
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
        <section className="fixed inset-0 z-[60] flex flex-col bg-[var(--surface)] px-4 pb-[calc(16px+env(safe-area-inset-bottom,0px))] pt-[calc(12px+env(safe-area-inset-top,0px))] md:inset-x-auto md:bottom-6 md:right-6 md:top-6 md:w-[430px] md:rounded-2xl md:border md:border-border md:shadow-2xl">
          <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-[var(--border)] md:hidden" />
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-text-muted">{isBg ? "Сега звучи" : "Now Playing"}</h2>
            <button onClick={() => setIsNowPlayingOpen(false)} className="grid h-10 w-10 place-items-center rounded-full border border-border" aria-label={isBg ? "Затвори" : "Close"}><X className="h-5 w-5 text-[var(--text)]" /></button>
          </div>

          <div className="mx-auto w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-[var(--surface-raised)] shadow-sm">
            {currentTrack.artworkUrl ? (
              <img src={currentTrack.artworkUrl} alt={isBg ? "Обложка" : "Artwork"} className="aspect-square w-full object-cover" />
            ) : (
              <div className="aspect-square w-full bg-gradient-to-br from-[var(--surface-raised)] to-[var(--surface)]" />
            )}
          </div>

          <div className="mt-5 min-w-0 text-center">
            <p className="truncate text-lg font-semibold text-[var(--text)]">{currentTrack.title}</p>
            <p className="truncate text-sm text-text-muted">{currentTrack.artist}</p>
          </div>

          <div className="mt-5">
            <input type="range" min={0} max={100} step={0.1} value={progress} onChange={(event) => seekToPercent(Number(event.target.value))} className="h-8 w-full themed-progress" aria-label={isBg ? "Прогрес" : "Track progress"} />
            <div className="mt-1 flex items-center justify-between text-xs text-text-muted">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
            <div className="flex justify-end">
              <button onClick={skipPrevious} className="grid h-12 w-12 place-items-center rounded-full border border-border" aria-label="Previous"><SkipBack className="h-5 w-5 text-[var(--text)]" /></button>
            </div>
            <button onClick={togglePlayPause} className="grid h-16 w-16 place-items-center rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)]" aria-label={isPlaying ? (isBg ? "Пауза" : "Pause playback") : (isBg ? "Пусни" : "Start playback")}>{isPlaying ? <Pause className="h-7 w-7 text-[var(--text)]" /> : <Play className="h-7 w-7 text-[var(--text)]" />}</button>
            <div className="flex justify-start">
              <button onClick={skipNext} className="grid h-12 w-12 place-items-center rounded-full border border-border" aria-label="Next"><SkipForward className="h-5 w-5 text-[var(--text)]" /></button>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <div className="grid grid-cols-4 gap-2">
              <button onClick={cycleRepeatMode} className={`inline-flex h-11 items-center justify-center rounded-full border px-2 text-xs font-medium ${repeatMode === "normal" ? "border-border text-[var(--muted)]" : "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--text)]"}`} aria-label={repeatLabel}><RotateCcw className="h-4 w-4" /></button>
              <button data-testid="queue-toggle-expanded" onClick={() => togglePanel("queue")} className="relative inline-flex h-11 items-center justify-center rounded-full border border-border" aria-label="Queue"><ListMusic className={`h-4 w-4 ${isQueueOpen ? "text-[var(--accent)]" : "text-[var(--text)]"}`} />{queue.length > 0 ? <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--accent)] px-1 text-[10px] text-white">{queue.length}</span> : null}</button>
              <button onClick={toggleMute} className="inline-flex h-11 items-center justify-center rounded-full border border-border" aria-label={volume === 0 ? "Unmute" : "Mute"}>{volume === 0 ? <VolumeX className="h-4 w-4 text-[var(--muted)]" /> : <Volume2 className="h-4 w-4 text-[var(--text)]" />}</button>
              <button onClick={() => setIsShortcutsOpen(true)} className="inline-flex h-11 items-center justify-center rounded-full border border-border" aria-label="Keyboard shortcuts"><Keyboard className="h-4 w-4 text-[var(--text)]" /></button>
            </div>
            <input type="range" min={0} max={100} value={volume} onChange={(event) => setVolume(Number(event.target.value))} className="h-8 w-full themed-progress" aria-label={isBg ? "Сила на звука" : "Volume"} />
          </div>

          {playerError ? <p className="mt-3 text-xs status-danger">{playerError}</p> : null}
        </section>
      ) : null}

      <div
        ref={playerBarRef}
        data-player-bar
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-[var(--surface)] px-3 pb-[calc(8px+env(safe-area-inset-bottom,0px))] pt-2 backdrop-blur-xl sm:px-5"
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
            <div className="flex items-center gap-2 rounded-xl border border-border bg-[var(--surface-raised)] px-2 py-2">
              {currentTrack.artworkUrl ? (
                <img src={currentTrack.artworkUrl} alt={isBg ? "Обложка" : "Artwork"} className="h-11 w-11 shrink-0 rounded-lg object-cover" />
              ) : (
                <div className="h-11 w-11 shrink-0 rounded-lg bg-[var(--surface)]" />
              )}
              <button type="button" onClick={() => setIsNowPlayingOpen(true)} className="min-w-0 flex-1 text-left">
                <p className="truncate text-sm font-semibold text-[var(--text)]">{currentTrack.title}</p>
                <p className="truncate text-xs text-text-muted">{currentTrack.artist}</p>
              </button>
              <div className="flex items-center gap-1">
                <button onClick={skipPrevious} className="hidden h-10 w-10 place-items-center rounded-full border border-border min-[380px]:grid" aria-label="Previous"><SkipBack className="h-4 w-4 text-[var(--text)]" /></button>
                <button onClick={togglePlayPause} className="grid h-10 w-10 place-items-center rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)]" aria-label={isPlaying ? (isBg ? "Пауза" : "Pause playback") : (isBg ? "Пусни" : "Start playback")}>{isPlaying ? <Pause className="h-4 w-4 text-[var(--text)]" /> : <Play className="h-4 w-4 text-[var(--text)]" />}</button>
                <button onClick={skipNext} className="hidden h-10 w-10 place-items-center rounded-full border border-border min-[380px]:grid" aria-label="Next"><SkipForward className="h-4 w-4 text-[var(--text)]" /></button>
                <button onClick={() => setIsNowPlayingOpen(true)} className="grid h-10 w-10 place-items-center rounded-full border border-border" aria-label={isBg ? "Разгъни" : "Expand now playing"}><ChevronDown className="h-4 w-4 text-[var(--text)]" /></button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
