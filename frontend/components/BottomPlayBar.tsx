"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, ListMusic, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX, X } from "lucide-react";
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
  const [isExpanded, setIsExpanded] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [lastVolume, setLastVolume] = useState(70);
  const playerBarRef = useRef<HTMLDivElement | null>(null);

  const {
    queue,
    currentIndex,
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
  } = usePlayer();

  const { state: sidebarState, togglePanel } = useDualSidebar();
  const isQueueOpen = sidebarState.open.queue;
  const progress = useMemo(() => (duration ? Math.min(100, (currentTime / duration) * 100) : 0), [currentTime, duration]);
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
      {isExpanded && (
        <button className="fixed inset-0 z-40 bg-black/40 md:hidden" aria-label={isBg ? "Затвори плейъра" : "Close player"} onClick={() => setIsExpanded(false)} />
      )}


      {isShortcutsOpen && (
        <div className="fixed inset-0 z-50 bg-black/60" onClick={() => setIsShortcutsOpen(false)}>
          <div className="mx-auto mt-24 w-[92%] max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold">{t("shortcuts_title", language)}</h3>
              <button onClick={() => setIsShortcutsOpen(false)} aria-label="Close shortcuts"><X className="w-5 h-5 text-[var(--muted)]" /></button>
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

      <div
        ref={playerBarRef}
        data-player-bar
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-[var(--surface)] px-3 pb-[calc(12px+env(safe-area-inset-bottom,0px))] pt-3 backdrop-blur-xl transition-all duration-300 ease-in-out sm:px-5"
      >
        <div className="mx-auto max-w-7xl">
          {!currentTrack || !currentVideoId ? (
            <div className="rounded-2xl border border-dashed border-border bg-[var(--surface-raised)] px-4 py-3 text-sm text-text-muted">
              {!currentTrack
                ? (isBg ? "Избери песен, за да се покаже YouTube плейърът." : "Choose a track to show the YouTube player.")
                : (isInitializing || isBuffering
                  ? (isBg ? "Подготвяне на видео…" : "Preparing video…")
                  : <span>
                      {isBg ? "Възпроизвеждането е недостъпно — отвори в YouTube." : "Playback unavailable — open on YouTube."}{" "}
                      <a className="underline" href={youtubeSearchUrl} target="_blank" rel="noreferrer">{isBg ? "Отвори търсене" : "Open search"}</a>
                    </span>)}
            </div>
          ) : (
            <div className="space-y-3">
              <div className={`flex ${isExpanded ? "flex-col" : "flex-row items-center gap-3"} transition-all duration-300 ease-in-out`}>
                <div className={`overflow-hidden rounded-xl border border-border bg-black/60 shrink-0 transition-all duration-300 ease-in-out ${isExpanded ? "w-full aspect-video" : "w-[120px] h-[68px] sm:w-40 sm:h-[90px]"}`}>
                  <iframe
                    id="ponotai-yt-player"
                    title={`${currentTrack.title} by ${currentTrack.artist}`}
                    src={`https://www.youtube.com/embed/${currentVideoId}?enablejsapi=1&autoplay=1&controls=1&rel=0&modestbranding=1`}
                    className="h-full w-full"
                    allow="autoplay; encrypted-media; picture-in-picture"
                    allowFullScreen
                  />
                </div>

                <button type="button" onClick={() => setIsExpanded((v) => !v)} className={`text-left ${isExpanded ? "mt-2" : "flex-1"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--text)]">{currentTrack.title}</p>
                      <p className="truncate text-xs text-text-muted">{currentTrack.artist}</p>
                    </div>
                    <span className="text-lg text-[var(--muted)]">{isExpanded ? "↓" : "↑"}</span>
                  </div>

                  {isExpanded && (
                    <span
                      aria-label="Collapse player"
                      className="mt-2 inline-flex rounded-full bg-[var(--accent)] p-2 text-[var(--accent-foreground)] shadow-md"
                    >
                      <span className="text-lg leading-none">↓</span>
                    </span>
                  )}
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button onClick={skipPrevious} className="h-10 w-10 rounded-full border border-border grid place-items-center" aria-label="Previous"><SkipBack className="w-4 h-4 text-[var(--text)]" /></button>
                <button onClick={togglePlayPause} className="h-10 w-10 rounded-full bg-[var(--accent-soft)] border border-[var(--accent-border)] grid place-items-center" aria-label={isPlaying ? (isBg ? "Пауза" : "Pause playback") : (isBg ? "Пусни" : "Start playback")}>{isPlaying ? <Pause className="w-4 h-4 text-[var(--text)]" /> : <Play className="w-4 h-4 text-[var(--text)]" />}</button>
                <button onClick={skipNext} className="h-10 w-10 rounded-full border border-border grid place-items-center" aria-label="Next"><SkipForward className="w-4 h-4 text-[var(--text)]" /></button>
                <button onClick={toggleMute} className="h-10 w-10 rounded-full border border-border grid place-items-center" aria-label={volume === 0 ? "Unmute" : "Mute"}>{volume === 0 ? <VolumeX className="w-4 h-4 text-[var(--muted)]" /> : <Volume2 className="w-4 h-4 text-[var(--text)]" />}</button>
                <button data-testid="queue-toggle" onClick={() => togglePanel("queue")} className="relative h-10 w-10 rounded-full border border-border grid place-items-center" aria-label="Queue"><ListMusic className={`w-4 h-4 ${isQueueOpen ? "text-[var(--accent)]" : "text-[var(--text)]"}`} />{queue.length > 0 ? <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--accent)] px-1 text-[10px] text-white">{queue.length}</span> : null}</button>
                <button onClick={() => setIsShortcutsOpen(true)} className="h-10 w-10 rounded-full border border-border grid place-items-center" aria-label="Keyboard shortcuts"><Keyboard className="w-4 h-4 text-[var(--text)]" /></button>

                <div className="ml-auto min-w-0 flex-1">
                  <div className="grid grid-cols-[40px_1fr_40px] items-center gap-2 text-xs text-text-muted">
                    <span>{formatTime(currentTime)}</span>
                    <input type="range" min={0} max={100} step={0.1} value={progress} onChange={(event) => seekToPercent(Number(event.target.value))} className="w-full themed-progress" aria-label={isBg ? "Прогрес" : "Track progress"} />
                    <span className="text-right">{formatTime(duration)}</span>
                  </div>
                  <input type="range" min={0} max={100} value={volume} onChange={(event) => setVolume(Number(event.target.value))} className="mt-2 w-full themed-progress" aria-label={isBg ? "Сила на звука" : "Volume"} />
                </div>
              </div>

              {playerError && <p className="text-xs text-red-300">{playerError}</p>}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
