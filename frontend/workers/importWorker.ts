// frontend/workers/importWorker.ts
import { parseAndCleanSongs } from "@/lib/importParser";

self.onmessage = (e: MessageEvent<{ text: string }>) => {
  try {
    const { text } = e.data;
    const result = parseAndCleanSongs(text);
    self.postMessage({
      success: true,
      songs: result.songs,
      invalidItems: result.invalidItems,
      skippedCount: result.skippedCount,
    });
  } catch (error) {
    self.postMessage({ success: false, error: (error as Error).message });
  }
};