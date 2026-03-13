"use client";

import { useMemo } from "react";
import { usePlayer } from "./PlayerProvider";
import { useLanguage } from "../lib/LanguageContext";

function formatTime(seconds: number) {
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const minutes = Math.floor(safe / 60).toString().padStart(2, "0");
  const secs = (safe % 60).toString().padStart(2, "0");
  return `${minutes}:${secs}`;
}

export default function BottomPlayBar() {
  const { language } = useLanguage();
  const isBg = language === "bg";

  const {
    currentTrack,
    currentVideoId,
    isPlaying,
    currentTime,
    duration,
    volume,
    isInitializing,
    playerError,
    togglePlayPause,
    skipNext,
    skipPrevious,
    seekToPercent,
    setVolume,
  } = usePlayer();

  const progress = useMemo(() => {
    if (!duration) return 0;
    return Math.min(100, (currentTime / duration) * 100);
  }, [currentTime, duration]);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-[linear-gradient(90deg,rgba(43,20,78,0.92),rgba(10,17,34,0.96))] px-3 py-3 backdrop-blur-xl sm:px-5">
      <div className="mx-auto flex max-w-7xl flex-col gap-3">
        <div className={currentTrack && currentVideoId ? "overflow-hidden rounded-2xl border border-border bg-black/60" : "hidden"}>
          <div id="ponotai-yt-player" className="aspect-video w-full" aria-label={currentTrack ? `${currentTrack.title} by ${currentTrack.artist}` : "YouTube player"} />
        </div>
        {!currentTrack && (
          <div className="rounded-2xl border border-dashed border-border bg-surface-overlay px-4 py-3 text-sm text-text-muted">
            {isBg ? "Избери песен, за да се покаже YouTube плейърът." : "Choose a track to show the YouTube player."}
          </div>
        )}
        {currentTrack && !currentVideoId && (
          <div className="rounded-2xl border border-dashed border-border bg-surface-overlay px-4 py-3 text-sm text-text-muted">
            {isBg ? "Зареждане на YouTube видео…" : "Loading a playable YouTube video…"}
          </div>
        )}

        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-text-primary" suppressHydrationWarning>{currentTrack?.title ?? (isBg ? "Няма избрана песен" : "No song selected")}</p>
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <span className="truncate" suppressHydrationWarning>{currentTrack?.artist ?? (isBg ? "Избери песен за стартиране" : "Pick a track to start playback")}</span>
              <span aria-hidden>•</span>
              <span className="inline-flex items-center gap-1 rounded-full border border-red-400/40 bg-red-500/10 px-2 py-0.5 text-[11px] text-red-200">▶ YouTube</span>
            </div>
            {isInitializing && <p className="mt-1 text-xs text-amber-200">{isBg ? "Инициализиране на YouTube плейър…" : "Initializing YouTube player…"}</p>}
            {playerError && <p className="mt-1 text-xs text-red-300">{playerError}</p>}
          </div>

          <div className="flex items-center gap-2">
            <button onClick={skipPrevious} className="h-10 w-10 rounded-full border border-border bg-surface-overlay text-sm text-text-primary" aria-label={isBg ? "Предишна песен" : "Previous track"}>⏮</button>
            <button onClick={togglePlayPause} className="h-11 w-11 rounded-full bg-surface text-lg text-text-primary shadow-lg shadow-white/20" aria-label={isPlaying ? (isBg ? "Пауза" : "Pause playback") : (isBg ? "Пусни" : "Start playback")}>{isPlaying ? "⏸" : "▶"}</button>
            <button onClick={skipNext} className="h-10 w-10 rounded-full border border-border bg-surface-overlay text-sm text-text-primary" aria-label={isBg ? "Следваща песен" : "Next track"}>⏭</button>
          </div>
        </div>

        <div className="grid grid-cols-1 items-center gap-2 text-xs text-text-muted sm:grid-cols-[52px_1fr_52px_120px] sm:gap-3">
          <span>{formatTime(currentTime)}</span>
          <input type="range" min={0} max={100} step={0.1} value={progress} onChange={(event) => seekToPercent(Number(event.target.value))} className="w-full accent-violet-400" aria-label={isBg ? "Прогрес" : "Track progress"} />
          <span className="text-right sm:text-left">{formatTime(duration)}</span>
          <div className="flex items-center gap-2">
            <span>🔊</span>
            <input type="range" min={0} max={100} value={volume} onChange={(event) => setVolume(Number(event.target.value))} className="w-full accent-cyan-400" aria-label={isBg ? "Сила на звука" : "Volume"} />
          </div>
        </div>
      </div>
    </div>
  );
}
