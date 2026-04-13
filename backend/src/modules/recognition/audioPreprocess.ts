export type PreprocessMode = "standard" | "live" | "humming" | "video";

export type PreprocessResult = {
  processedBuffer: Buffer;
  clipVariants: Buffer[];
  notes: string[];
};

const MIN_BUFFER_BYTES = 6_000;

function trimZeroEdges(buffer: Buffer): Buffer {
  let start = 0;
  let end = buffer.length;

  while (start < end && buffer[start] === 0) start += 1;
  while (end > start && buffer[end - 1] === 0) end -= 1;

  return buffer.subarray(start, end);
}

function createConcertVariants(buffer: Buffer): Buffer[] {
  // Keep bounded: max 3 deterministic variants to avoid provider spam.
  return [buffer, buffer, buffer];
}

export function preprocessAudioForRecognition(buffer: Buffer, mode: PreprocessMode): PreprocessResult {
  if (buffer.byteLength < MIN_BUFFER_BYTES) {
    throw new Error("Audio sample is too short. Please record a clearer 6-10 second clip.");
  }

  const trimmed = trimZeroEdges(buffer);
  const notes: string[] = [];
  if (trimmed.byteLength !== buffer.byteLength) {
    notes.push("trimmed_edge_silence");
  }

  const processedBuffer = trimmed.byteLength > 0 ? trimmed : buffer;
  const clipVariants = mode === "live" ? createConcertVariants(processedBuffer) : [processedBuffer];

  notes.push(mode === "humming" ? "humming_path" : "default_preprocess");

  return {
    processedBuffer,
    clipVariants,
    notes,
  };
}
