"use client";

import { useMemo, useState } from "react";
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
  const [isExpanded, setIsExpanded] = useState(false);
  const [lastVolume, setLastVolume] = useState(70);

  const {
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
  } = usePlayer();

  const progress = useMemo(() => (duration ? Math.min(100, (currentTime / duration) * 100) : 0), [currentTime, duration]);
  const youtubeSearchUrl = currentTrack
    ? `https://www.youtube.com/results?search_query=${encodeURIComponent(`${currentTrack.title} ${currentTrack.artist}`)}`
    : "#";

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
        <button
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          aria-label={isBg ? "Затвори плейъра" : "Close player"}
          onClick={() => setIsExpanded(false)}
        />
      )}

      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-white/95 text-gray-900 backdrop-blur-xl dark:bg-[linear-gradient(90deg,rgba(43,20,78,0.92),rgba(10,17,34,0.96))] dark:text-white px-3 py-3 sm:px-5 transition-all duration-300 ease-in-out">
        <div className="mx-auto max-w-7xl">
          {!currentTrack || !currentVideoId ? (
            <div className="rounded-2xl border border-dashed border-border bg-gray-100 px-4 py-3 text-sm text-gray-700 dark:bg-surface-overlay dark:text-text-muted">
              {!currentTrack
                ? (isBg ? "Избери песен, за да се покаже YouTube плейърът." : "Choose a track to show the YouTube player.")
                : (isInitializing || isBuffering
                  ? (isBg ? "Подготвяне на видео…" : "Preparing video…")
                  : <span>
                      {isBg ? "Възпроизвеждането е недостъпно — отвори в YouTube." : "Playback unavailable — open on YouTube."}{" "}
                      <a className="underline" href={youtubeSearchUrl} target="_blank" rel="noreferrer">
                        {isBg ? "Отвори търсене" : "Open search"}
                      </a>
                    </span>)}
            </div>
          ) : (
            <div className="space-y-3">
              <div className={`flex ${isExpanded ? "flex-col" : "flex-row items-center gap-3"} transition-all duration-300 ease-in-out`}>
                <div
                  className={`overflow-hidden rounded-xl border border-border bg-gray-200 dark:bg-black/60 shrink-0 transition-all duration-300 ease-in-out ${isExpanded ? "w-full aspect-video" : "w-[120px] h-[68px] sm:w-40 sm:h-[90px]"}`}
                >
                  <iframe
                    id="ponotai-yt-player"
                    title={`${currentTrack.title} by ${currentTrack.artist}`}
                    src={`https://www.youtube.com/embed/${currentVideoId}?enablejsapi=1&autoplay=1&controls=1&rel=0&modestbranding=1`}
                    className="h-full w-full"
                    allow="autoplay; encrypted-media; picture-in-picture"
                    allowFullScreen
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setIsExpanded((v) => !v)}
                  className={`text-left ${isExpanded ? "mt-2" : "flex-1"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900 dark:text-text-primary">{currentTrack.title}</p>
                      <p className="truncate text-xs text-gray-700 dark:text-text-muted">{currentTrack.artist}</p>
                    </div>
                    <span className="text-lg text-gray-700 dark:text-gray-200">{isExpanded ? "↓" : "↑"}</span>
                  </div>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button onClick={togglePlayPause} className="h-10 w-10 rounded-full bg-gray-200 text-lg text-gray-900 dark:bg-surface dark:text-text-primary" aria-label={isPlaying ? (isBg ? "Пауза" : "Pause playback") : (isBg ? "Пусни" : "Start playback")}>{isPlaying ? "⏸" : "▶"}</button>
                <button onClick={toggleMute} className="h-10 rounded-full border border-border px-3 text-sm bg-white text-gray-900 dark:bg-surface-overlay dark:text-text-primary" aria-label={volume === 0 ? (isBg ? "Включи звук" : "Unmute") : (isBg ? "Изключи звук" : "Mute")}>{volume === 0 ? "🔇" : "🔊"}</button>

                <div className="ml-auto min-w-0 flex-1">
                  <div className="grid grid-cols-[40px_1fr_40px] items-center gap-2 text-xs text-gray-700 dark:text-text-muted">
                    <span>{formatTime(currentTime)}</span>
                    <input type="range" min={0} max={100} step={0.1} value={progress} onChange={(event) => seekToPercent(Number(event.target.value))} className="w-full accent-violet-400" aria-label={isBg ? "Прогрес" : "Track progress"} />
                    <span className="text-right">{formatTime(duration)}</span>
                  </div>
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
