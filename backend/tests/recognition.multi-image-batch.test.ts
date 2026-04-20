import test from "node:test";
import assert from "node:assert/strict";
import type { Request } from "express";
import { collectUploadedImageFiles, dedupeCombinedOcrSongs } from "../src/modules/recognition/recognition.controller.ts";

test("dedupeCombinedOcrSongs keeps strongest duplicate across batch images", () => {
  const deduped = dedupeCombinedOcrSongs([
    {
      songName: "Blinding Lights",
      artist: "The Weeknd",
      album: "After Hours",
      genre: "Pop",
      releaseYear: 2020,
      confidenceScore: 0.55,
      platformLinks: {},
      youtubeVideoId: "a",
      albumArtUrl: "",
      durationSec: 0,
      source: "ocr_fallback",
      verificationStatus: "not_found",
    },
    {
      songName: "Blinding Lights",
      artist: "The Weeknd",
      album: "After Hours",
      genre: "Pop",
      releaseYear: 2020,
      confidenceScore: 0.91,
      platformLinks: {},
      youtubeVideoId: "b",
      albumArtUrl: "",
      durationSec: 0,
      source: "provider",
      verificationStatus: "verified",
    },
    {
      songName: "Levitating",
      artist: "Dua Lipa",
      album: "Future Nostalgia",
      genre: "Pop",
      releaseYear: 2020,
      confidenceScore: 0.62,
      platformLinks: {},
      youtubeVideoId: "c",
      albumArtUrl: "",
      durationSec: 0,
      source: "provider",
      verificationStatus: "verified",
    },
  ], 5);

  assert.equal(deduped.length, 2);
  assert.equal(deduped[0]?.songName, "Blinding Lights");
  assert.equal(deduped[0]?.confidenceScore, 0.91);
});

test("collectUploadedImageFiles supports both image and images fields and truncates", () => {
  const req = {
    files: {
      image: [{ originalname: "single.png" }],
      images: [{ originalname: "batch-1.png" }, { originalname: "batch-2.png" }],
    },
  } as unknown as Request;

  const result = collectUploadedImageFiles(req, 2);
  assert.equal(result.uploadedImages.length, 2);
  assert.equal(result.truncated, true);
});
