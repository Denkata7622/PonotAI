import test from "node:test";
import assert from "node:assert/strict";
import { recognizeFromImage } from "../features/recognition/api";
import { getVisibleOcrCandidates } from "../features/recognition/ui";

test("recognizeFromImage sends maxSongs/language and keeps multiple songs", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ body: FormData }> = [];

  try {
    globalThis.fetch = (async (_url, init) => {
      const body = init?.body as FormData;
      calls.push({ body });
      return {
        ok: true,
        json: async () => ({
          songs: [
            { songName: "One", artist: "A", album: "X", genre: "Pop", releaseYear: 2024, platformLinks: {}, albumArtUrl: "", confidence: 0.9, durationSec: 10 },
            { songName: "Two", artist: "B", album: "Y", genre: "Pop", releaseYear: 2023, platformLinks: {}, albumArtUrl: "", confidence: 0.8, durationSec: 10 },
            { songName: "Three", artist: "C", album: "Z", genre: "Pop", releaseYear: 2022, platformLinks: {}, albumArtUrl: "", confidence: 0.7, durationSec: 10 },
          ],
          language: "spa",
          warnings: [],
        }),
      } as Response;
    }) as typeof fetch;

    const file = new File(["abc"], "cover.png", { type: "image/png" });
    const result = await recognizeFromImage(file, 2, "spa");

    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.get("maxSongs"), "2");
    assert.equal(calls[0].body.get("language"), "spa");
    assert.equal(result.songs.length, 2);
    assert.equal(result.songs[0]?.songName, "One");
    assert.equal(result.songs[1]?.songName, "Two");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("getVisibleOcrCandidates excludes the strongest first OCR match", () => {
  const visible = getVisibleOcrCandidates({
    songs: [
      { songName: "Top", artist: "A", album: "X", genre: "Pop", releaseYear: 2024, platformLinks: {}, albumArtUrl: "", confidence: 0.91, durationSec: 10 },
      { songName: "Second", artist: "B", album: "Y", genre: "Pop", releaseYear: 2023, platformLinks: {}, albumArtUrl: "", confidence: 0.75, durationSec: 10 },
    ],
    count: 2,
    language: "eng",
  });

  assert.equal(visible.length, 1);
  assert.equal(visible[0]?.songName, "Second");
});
