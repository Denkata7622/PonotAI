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

let rememberedVolume = 70;

export function toggleMuteWithMemory(volume: number, setVolume: (value: number) => void) {
  if (volume === 0) {
    setVolume(rememberedVolume || 70);
    return;
  }
  rememberedVolume = volume;
  setVolume(0);
}
