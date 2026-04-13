import test from "node:test";
import assert from "node:assert/strict";
import { __setImageOcrExtractorsForTests, recognizeSongFromImage } from "../src/modules/recognition/recognition.service.ts";

const SAMPLE = Buffer.from("fake-image");

test("OCR pipeline rejects obvious tutorial/UI junk candidates", async () => {
  __setImageOcrExtractorsForTests({
    aiExtractor: async () => ({
      status: "success",
      songs: [
        { title: "The Python Tutorial.", artist: "CodeWars", confidenceScore: 0.88 },
        { title: "Next", artist: "Settings", confidenceScore: 0.81 },
        { title: "Blinding Lights", artist: "The Weeknd", confidenceScore: 0.86 },
      ],
    }),
    tesseractExtractor: async () => [],
    lookupExtractor: async (songName, artist) => ({
      songName,
      artist,
      album: "Test Album",
      genre: "Pop",
      releaseYear: 2024,
      confidenceScore: 0.9,
      platformLinks: {},
      youtubeVideoId: "abc123",
    }),
  });

  try {
    const result = await recognizeSongFromImage(SAMPLE, "eng", "image/png", 5);
    assert.equal(result.songs.length, 1);
    assert.equal(result.songs[0]?.songName, "Blinding Lights");
    assert.equal(result.songs[0]?.artist, "The Weeknd");
  } finally {
    __setImageOcrExtractorsForTests(null);
  }
});
