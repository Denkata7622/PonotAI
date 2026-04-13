import type { ImageRecognitionResult, SongMatch } from "./api";

export function getVisibleOcrCandidates(imageResult: ImageRecognitionResult | null): SongMatch[] {
  if (!imageResult) return [];
  return imageResult.songs.slice(1);
}
