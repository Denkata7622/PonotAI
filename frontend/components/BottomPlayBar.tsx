"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { ChevronDown, Keyboard, ListMusic, Pause, Play, RotateCcw, SkipBack, SkipForward, Volume2, VolumeX, X, Sparkles } from "lucide-react";
import { usePlayer } from "./PlayerProvider";
import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/translations";
import { formatPlayerTime, getRepeatModeLabel, useVolumeUi } from "./player/playerUiUtils";

type WorkspaceTab = "queue" | "assistant" | "context";

type BottomPlayBarProps = {
  isNowPlayingOpen: boolean;
  workspacePhase: "closed" | "opening" | "open" | "closing";
  onNowPlayingOpenChange: (open: boolean) => void;
  onWorkspaceTabChange: (tab: WorkspaceTab) => void;
  expandedVideoHostRef: RefObject<HTMLDivElement | null>;
};

export default function BottomPlayBar({ isNowPlayingOpen, workspacePhase, onNowPlayingOpenChange, onWorkspaceTabChange, expandedVideoHostRef }: BottomPlayBarProps) {
  const { language } = useLanguage();
  const isBg = language === "bg";
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const playerBarRef = useRef<HTMLDivElement | null>(null);
  const collapsedVideoHostRef = useRef<HTMLDivElement | null>(null);
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

  const progress = useMemo(() => (duration ? Math.min(100, (currentTime / duration) * 100) : 0), [currentTime, duration]);
  const repeatLabel = getRepeatModeLabel(repeatMode, isBg);
  const { isVolumePanelOpen, setIsVolumePanelOpen, toggleMute, updateVolume } = useVolumeUi(volume, setVolume);
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
    if (!currentTrack || !currentVideoId) return;
    if (!youtubeMountRef.current) {
      youtubeMountRef.current = document.createElement("div");
      youtubeMountRef.current.className = "h-full w-full";
    }
    const target = isNowPlayingOpen ? expandedVideoHostRef.current : collapsedVideoHostRef.current;
    if (target && !target.contains(youtubeMountRef.current)) {
      target.innerHTML = "";
      target.appendChild(youtubeMountRef.current);
    }
  }, [currentTrack, currentVideoId, isNowPlayingOpen, expandedVideoHostRef]);

  useEffect(() => {
    if (!currentTrack || !currentVideoId) {
      onNowPlayingOpenChange(false);
    }
  }, [currentTrack, currentVideoId, onNowPlayingOpenChange]);

  useEffect(() => {
    if (!isNowPlayingOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onNowPlayingOpenChange(false);
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isNowPlayingOpen, onNowPlayingOpenChange]);

  function handleQueueClick() {
    if (!isNowPlayingOpen) onNowPlayingOpenChange(true);
    onWorkspaceTabChange("queue");
  }

  function handleAssistantClick() {
    if (!isNowPlayingOpen) onNowPlayingOpenChange(true);
    onWorkspaceTabChange("assistant");
  }

  const sharedVolumeSlider = (
    <div className="absolute bottom-[calc(100%+8px)] right-0 z-[72] rounded-xl border border-border bg-[var(--surface)] p-3 shadow-xl">
      <button
        type="button"
        onClick={toggleMute}
        className="mb-2 w-full rounded-lg bg-[var(--surface-subtle)] px-2 py-1 text-xs text-[var(--text)]"
      >
        {volume === 0 ? (isBg ? "Включи звук" : "Unmute") : (isBg ? "Изключи звук" : "Mute")}
      </button>
      <input
        type="range"
        min={0}
        max={100}
        value={volume}
        onChange={(event) => updateVolume(Number(event.target.value))}
        className="h-28 w-8 accent-[var(--accent)]"
        aria-label={isBg ? "Сила на звука" : "Volume"}
      />
    </div>
  );

  return (
    <>
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


      <div
        ref={playerBarRef}
        data-player-bar
        className={`fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-[var(--surface)] px-2 pb-[calc(8px+env(safe-area-inset-bottom,0px))] pt-2 backdrop-blur-xl transition-[border-color,box-shadow,transform] duration-300 sm:px-4 ${workspacePhase === "open" || workspacePhase === "opening" ? "border-[var(--accent-soft)] shadow-[0_-10px_26px_rgba(0,0,0,0.2)] -translate-y-[2px]" : ""}`}
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
            <div className="rounded-2xl bg-[var(--surface-raised)] p-2.5">
              <div className="grid gap-2 md:grid-cols-[minmax(220px,1fr)_auto_auto_96px] md:items-center">
                <button type="button" onClick={() => onNowPlayingOpenChange(true)} className="flex min-w-0 items-center gap-3 rounded-xl px-2 py-1.5 text-left transition hover:bg-[var(--surface-subtle)]">
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

                <div className="hidden items-center gap-1 rounded-full bg-[var(--surface-subtle)] p-1 md:flex">
                  <button onClick={skipPrevious} className="grid h-9 w-9 place-items-center rounded-full" aria-label="Previous"><SkipBack className="h-4 w-4 text-[var(--text)]" /></button>
                  <button onClick={togglePlayPause} className="grid h-10 w-10 place-items-center rounded-full bg-[var(--accent-soft)]" aria-label={isPlaying ? (isBg ? "Пауза" : "Pause playback") : (isBg ? "Пусни" : "Start playback")}>{isPlaying ? <Pause className="h-4 w-4 text-[var(--text)]" /> : <Play className="h-4 w-4 text-[var(--text)]" />}</button>
                  <button onClick={skipNext} className="grid h-9 w-9 place-items-center rounded-full" aria-label="Next"><SkipForward className="h-4 w-4 text-[var(--text)]" /></button>
                </div>

                <div className="hidden items-center gap-1 md:flex">
                  <button onClick={cycleRepeatMode} className={`grid h-9 w-9 place-items-center rounded-full ${repeatMode === "normal" ? "bg-[var(--surface-subtle)] text-[var(--muted)]" : "bg-[var(--accent-soft)] text-[var(--text)]"}`} aria-label={repeatLabel}><RotateCcw className="h-4 w-4" /></button>
                  <button data-testid="queue-toggle-dock" onClick={handleQueueClick} className="relative grid h-9 w-9 place-items-center rounded-full bg-[var(--surface-subtle)]" aria-label="Queue"><ListMusic className="h-4 w-4 text-[var(--text)]" />{queue.length > 0 ? <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--accent)] px-1 text-[10px] text-white">{queue.length}</span> : null}</button>
                  <button onClick={handleAssistantClick} className="grid h-9 w-9 place-items-center rounded-full bg-[var(--surface-subtle)]" aria-label="AI assistant"><Sparkles className="h-4 w-4 text-[var(--text)]" /></button>
                  <div className="relative">
                    <button onClick={() => setIsVolumePanelOpen((prev) => !prev)} className="grid h-9 w-9 place-items-center rounded-full bg-[var(--surface)]" aria-label={isBg ? "Сила на звука" : "Volume controls"}>{volume === 0 ? <VolumeX className="h-4 w-4 text-[var(--muted)]" /> : <Volume2 className="h-4 w-4 text-[var(--text)]" />}</button>
                    {isVolumePanelOpen ? sharedVolumeSlider : null}
                  </div>
                  <button onClick={() => onNowPlayingOpenChange(true)} className="grid h-9 w-9 place-items-center rounded-full bg-[var(--surface-subtle)]" aria-label={isBg ? "Разгъни" : "Expand now playing"}><ChevronDown className="h-4 w-4 rotate-180 text-[var(--text)]" /></button>
                </div>

                <div className="hidden h-14 overflow-hidden rounded-xl bg-black md:block md:justify-self-end">
                  <div ref={collapsedVideoHostRef} className="h-full w-full" />
                </div>
              </div>

              <div className="mt-2 flex items-center gap-2 text-xs text-text-muted">
                <span className="w-10 shrink-0 text-right">{formatPlayerTime(currentTime)}</span>
                <input type="range" min={0} max={100} step={0.1} value={progress} onChange={(event) => seekToPercent(Number(event.target.value))} className="h-7 min-w-0 flex-1 themed-progress" aria-label={isBg ? "Прогрес" : "Track progress"} />
                <span className="w-10 shrink-0">{formatPlayerTime(duration)}</span>
              </div>

              <div className="mt-2 space-y-2 md:hidden">
                <div className="grid grid-cols-[minmax(0,1fr)_90px] items-center gap-2">
                  <button type="button" onClick={() => onNowPlayingOpenChange(true)} className="flex min-w-0 items-center gap-2 rounded-xl px-2 py-1 text-left">
                    <p className="truncate text-sm font-semibold text-[var(--text)]">{currentTrack.title}</p>
                  </button>
                  <div className="h-12 overflow-hidden rounded-xl bg-black">
                    <div ref={collapsedVideoHostRef} className="h-full w-full" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 rounded-full bg-[var(--surface-subtle)] p-1">
                  <button onClick={skipPrevious} className="grid h-11 place-items-center rounded-full" aria-label="Previous"><SkipBack className="h-5 w-5 text-[var(--text)]" /></button>
                  <button onClick={togglePlayPause} className="grid h-11 place-items-center rounded-full bg-[var(--accent-soft)]" aria-label={isPlaying ? (isBg ? "Пауза" : "Pause playback") : (isBg ? "Пусни" : "Start playback")}>{isPlaying ? <Pause className="h-5 w-5 text-[var(--text)]" /> : <Play className="h-5 w-5 text-[var(--text)]" />}</button>
                  <button onClick={skipNext} className="grid h-11 place-items-center rounded-full" aria-label="Next"><SkipForward className="h-5 w-5 text-[var(--text)]" /></button>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  <button onClick={cycleRepeatMode} className={`grid h-10 place-items-center rounded-full ${repeatMode === "normal" ? "bg-[var(--surface-subtle)] text-[var(--muted)]" : "bg-[var(--accent-soft)] text-[var(--text)]"}`} aria-label={repeatLabel}><RotateCcw className="h-4 w-4" /></button>
                  <button onClick={handleQueueClick} className="relative grid h-10 place-items-center rounded-full bg-[var(--surface-subtle)]" aria-label="Queue"><ListMusic className="h-4 w-4 text-[var(--text)]" />{queue.length > 0 ? <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--accent)] px-1 text-[10px] text-white">{queue.length}</span> : null}</button>
                  <button onClick={handleAssistantClick} className="grid h-10 place-items-center rounded-full bg-[var(--surface-subtle)]" aria-label="AI assistant"><Sparkles className="h-4 w-4 text-[var(--text)]" /></button>
                  <div className="relative">
                    <button onClick={() => setIsVolumePanelOpen((prev) => !prev)} className="grid h-10 w-full place-items-center rounded-full bg-[var(--surface)]" aria-label={isBg ? "Сила на звука" : "Volume controls"}>{volume === 0 ? <VolumeX className="h-4 w-4 text-[var(--muted)]" /> : <Volume2 className="h-4 w-4 text-[var(--text)]" />}</button>
                    {isVolumePanelOpen ? sharedVolumeSlider : null}
                  </div>
                  <button onClick={() => onNowPlayingOpenChange(true)} className="grid h-10 place-items-center rounded-full bg-[var(--surface-subtle)]" aria-label={isBg ? "Разгъни" : "Expand now playing"}><ChevronDown className="h-4 w-4 rotate-180 text-[var(--text)]" /></button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
