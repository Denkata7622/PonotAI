import { useCallback, useEffect, useRef, useState } from "react";

export function formatPlayerTime(seconds: number) {
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const minutes = Math.floor(safe / 60).toString().padStart(2, "0");
  const secs = (safe % 60).toString().padStart(2, "0");
  return `${minutes}:${secs}`;
}

export function getRepeatModeLabel(repeatMode: "normal" | "queue" | "track", isBg: boolean) {
  if (repeatMode === "normal") return isBg ? "Без повторение" : "Repeat off";
  if (repeatMode === "queue") return isBg ? "Повтаряне на опашката" : "Repeat queue";
  return isBg ? "Повтаряне на песента" : "Repeat track";
}

export function getRepeatModeTooltip(repeatMode: "normal" | "queue" | "track", isBg: boolean) {
  if (repeatMode === "normal") {
    return isBg ? "Без повторение • натисни за повтаряне на опашката" : "Repeat off • click to switch to repeat queue";
  }
  if (repeatMode === "queue") {
    return isBg ? "Повтаряне на опашката • натисни за повтаряне на песента" : "Repeat queue • click to switch to repeat track";
  }
  return isBg ? "Повтаряне на песента • натисни за изключване" : "Repeat track • click to turn repeat off";
}

export function useVolumeUi(volume: number, setVolume: (value: number) => void) {
  const [isVolumePanelOpen, setIsVolumePanelOpen] = useState(false);
  const lastVolumeRef = useRef(70);

  useEffect(() => {
    if (volume > 0) {
      lastVolumeRef.current = volume;
    }
  }, [volume]);

  const toggleMute = useCallback(() => {
    if (volume === 0) {
      setVolume(lastVolumeRef.current || 70);
      return;
    }
    lastVolumeRef.current = volume;
    setVolume(0);
  }, [setVolume, volume]);

  const updateVolume = useCallback((value: number) => {
    if (value > 0) {
      lastVolumeRef.current = value;
    }
    setVolume(value);
  }, [setVolume]);

  return {
    isVolumePanelOpen,
    setIsVolumePanelOpen,
    toggleMute,
    updateVolume,
  };
}
