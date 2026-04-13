import test from "node:test";
import assert from "node:assert/strict";
import { recognizeSongFromImage, __setImageOcrExtractorsForTests } from "../src/modules/recognition/recognition.service.ts";

const SAMPLE = Buffer.from("fake-image");

test("image recognition attempts primary AI OCR first and avoids tesseract fallback on success", async () => {
  const calls: string[] = [];
  __setImageOcrExtractorsForTests({
    aiExtractor: async () => {
      calls.push("ai");
      return { status: "success", title: "Blinding Lights", artist: "The Weeknd", confidenceScore: 0.88 };
    },
    tesseractExtractor: async () => {
      calls.push("tesseract");
      return { songName: "Fallback Song", artist: "Fallback Artist", album: "Unknown Album", confidenceScore: 0.3 };
    },
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

test("image recognition falls back to tesseract only when primary AI OCR is unavailable", async () => {
  const calls: string[] = [];
  __setImageOcrExtractorsForTests({
    aiExtractor: async () => {
      calls.push("ai");
      return { status: "unavailable", reason: "missing_api_key" };
    },
    tesseractExtractor: async () => {
      calls.push("tesseract");
      return { songName: "Low Signal", artist: "Unknown Artist", album: "Unknown Album", confidenceScore: 0.28 };
    },
  });

  try {
    const result = await recognizeSongFromImage(SAMPLE, "eng", "image/jpeg");
    assert.deepEqual(calls, ["ai", "tesseract"]);
    assert.equal(result.ocrPath, "tesseract_only");
    assert.equal(result.warnings.some((warning) => warning.startsWith("PRIMARY_OCR_UNAVAILABLE:")), true);
    assert.equal(result.songs[0]?.warnings?.includes("LOW_CONFIDENCE_MATCH"), true);
    assert.equal(result.songs[0]?.resultState, "need_better_sample");
  } finally {
    __setImageOcrExtractorsForTests(null);
  }
});
