import test from "node:test";
import assert from "node:assert/strict";
import {
  __setAiImageOcrRunnersForTests,
  cleanupTesseractTextWithGemma,
  DIRECT_IMAGE_OCR_MODELS,
  extractMetadataWithAiOcr,
  GEMMA_TEXT_CLEANUP_MODELS,
} from "../src/modules/recognition/aiImageOcr.service.ts";
import { __setImageOcrExtractorsForTests, recognizeSongFromImage } from "../src/modules/recognition/recognition.service.ts";

const SAMPLE_IMAGE = Buffer.from("sample-image");

test("direct image OCR model chain uses exact configured order", async () => {
  process.env.GEMINI_API_KEY = "test";
  const order: string[] = [];
  __setAiImageOcrRunnersForTests({
    directRunner: async (_apiKey, modelName) => {
      order.push(modelName);
      return { status: "unavailable", reason: "provider_error", model: modelName };
    },
  });

  try {
    await extractMetadataWithAiOcr(SAMPLE_IMAGE, "image/png");
    assert.deepEqual(order, [...DIRECT_IMAGE_OCR_MODELS]);
  } finally {
    __setAiImageOcrRunnersForTests(null);
  }
});

test("gemma cleanup chain uses exact text-only model order", async () => {
  process.env.GEMINI_API_KEY = "test";
  const order: string[] = [];
  __setAiImageOcrRunnersForTests({
    cleanupRunner: async (_apiKey, modelName) => {
      order.push(modelName);
      return { status: "unavailable", reason: "provider_error", model: modelName };
    },
  });

  try {
    await cleanupTesseractTextWithGemma("Noise text from tesseract");
    assert.deepEqual(order, [...GEMMA_TEXT_CLEANUP_MODELS]);
  } finally {
    __setAiImageOcrRunnersForTests(null);
  }
});

test("tesseract + gemma fallback happens only after direct OCR failure and youtube checks are deduped", async () => {
  const calls = { ai: 0, tesseract: 0, gemma: 0, youtube: 0 };
  __setImageOcrExtractorsForTests({
    aiExtractor: async () => {
      calls.ai += 1;
      return { status: "unavailable", reason: "provider_error" };
    },
    tesseractExtractor: async () => {
      calls.tesseract += 1;
      return [
        { songName: "Blinding Lights", artist: "The Weeknd", album: "Unknown Album", confidenceScore: 0.66 },
        { songName: "Blinding Lights", artist: "The Weeknd", album: "Unknown Album", confidenceScore: 0.65 },
      ];
    },
    gemmaCleanupExtractor: async () => {
      calls.gemma += 1;
      return {
        status: "success",
        model: "gemma-3-4b-it",
        songs: [{ title: "Blinding Lights", artist: "The Weeknd", confidenceScore: 0.74 }],
      };
    },
    lookupExtractor: async () => {
      calls.youtube += 1;
      return {
        songName: "Blinding Lights",
        artist: "The Weeknd",
        album: "After Hours",
        genre: "Pop",
        releaseYear: 2020,
        confidenceScore: 0.92,
        platformLinks: {},
        youtubeVideoId: "abc123",
      };
    },
  });

  try {
    const result = await recognizeSongFromImage(SAMPLE_IMAGE, "eng", "image/jpeg", 5);
    assert.equal(result.ocrPath, "tesseract_plus_gemma");
    assert.equal(calls.ai, 1);
    assert.equal(calls.tesseract, 1);
    assert.equal(calls.gemma, 1);
    assert.equal(calls.youtube, 1);
  } finally {
    __setImageOcrExtractorsForTests(null);
  }
});
