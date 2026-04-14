import test from "node:test";
import assert from "node:assert/strict";
import { DIRECT_IMAGE_OCR_MODELS, GEMMA_TEXT_CLEANUP_MODELS } from "../src/modules/recognition/aiImageOcr.service.ts";

test("OCR model config excludes stale provider model names", () => {
  assert.deepEqual([...DIRECT_IMAGE_OCR_MODELS], ["gemini-2.5-flash", "gemini-2.5-flash-lite"]);
  assert.deepEqual([...GEMMA_TEXT_CLEANUP_MODELS], ["gemma-3-4b-it", "gemma-3-12b-it"]);
});
