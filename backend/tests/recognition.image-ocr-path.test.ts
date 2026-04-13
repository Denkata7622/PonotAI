import test from "node:test";
import assert from "node:assert/strict";
import { recognizeSongFromImage, __setImageOcrExtractorsForTests } from "../src/modules/recognition/recognition.service.ts";

const SAMPLE = Buffer.from("fake-image");


test("image recognition respects maxSongs and returns multiple OCR candidates when available", async () => {
  __setImageOcrExtractorsForTests({
    aiExtractor: async () => ({
      status: "success",
      songs: [
        { title: "Song One", artist: "Artist One", confidenceScore: 0.91 },
        { title: "Song Two", artist: "Artist Two", confidenceScore: 0.77 },
        { title: "Song Three", artist: "Artist Three", confidenceScore: 0.69 },
      ],
    }),
    tesseractExtractor: async () => [{ songName: "Ignored", artist: "Ignored", album: "Unknown Album", confidenceScore: 0.3 }],
    lookupExtractor: async (songName, artist) => ({
      songName,
      artist,
      album: "Test Album",
      genre: "Pop",
      releaseYear: 2024,
      confidenceScore: 0.9,
      platformLinks: {},
      youtubeVideoId: undefined,
    }),
  });

  try {
    const result = await recognizeSongFromImage(SAMPLE, "eng", "image/png", 2);
    assert.equal(result.songs.length, 2);
    assert.equal(result.songs[0]?.songName, "Song One");
    assert.equal(result.songs[1]?.songName, "Song Two");
  } finally {
    __setImageOcrExtractorsForTests(null);
  }
});

test("image recognition falls back to tesseract only when primary AI OCR is unavailable", async () => {
  const calls: string[] = [];
  __setImageOcrExtractorsForTests({
    aiExtractor: async () => {
      calls.push("ai");
      return { status: "unavailable", reason: "missing_api_key" };
    },
    tesseractExtractor: async () => {
      calls.push("tesseract");
      return [{ songName: "Low Signal", artist: "Unknown Artist", album: "Unknown Album", confidenceScore: 0.28 }];
    },
    lookupExtractor: async () => null,
  });

  try {
    const result = await recognizeSongFromImage(SAMPLE, "eng", "image/jpeg");
    assert.deepEqual(calls, ["ai", "tesseract"]);
    assert.equal(result.ocrPath, "tesseract_plus_gemma");
    assert.equal(result.warnings.some((warning) => warning.startsWith("PRIMARY_OCR_UNAVAILABLE:")), true);
    assert.equal(result.songs[0]?.warnings?.includes("LOW_CONFIDENCE_MATCH"), true);
    assert.equal(result.songs[0]?.resultState, "need_better_sample");
  } finally {
    __setImageOcrExtractorsForTests(null);
  }
});

test("image recognition attempts primary AI OCR first and avoids tesseract fallback on success", async () => {
  const calls: string[] = [];
  __setImageOcrExtractorsForTests({
    aiExtractor: async () => {
      calls.push("ai");
      return {
        status: "success",
        songs: [{ title: "Blinding Lights", artist: "The Weeknd", confidenceScore: 0.88 }],
      };
    },
    tesseractExtractor: async () => {
      calls.push("tesseract");
      return [{ songName: "Fallback Song", artist: "Fallback Artist", album: "Unknown Album", confidenceScore: 0.3 }];
    },
    lookupExtractor: async () => null,
  });

  try {
    const result = await recognizeSongFromImage(SAMPLE, "eng", "image/png");
    assert.equal(calls[0], "ai");
    assert.equal(calls.includes("tesseract"), false);
    assert.equal(result.ocrPath, "ai_primary");
  } finally {
    __setImageOcrExtractorsForTests(null);
  }
});
