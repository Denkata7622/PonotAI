import test from "node:test";
import assert from "node:assert/strict";
import { recognizeVerifyAndQueue } from "../features/recognition/flow.ts";

test("integration: recognize -> verify -> queue", async () => {
  const queued: unknown[] = [];

  const result = await recognizeVerifyAndQueue({
    recognize: async () => ({
      primaryMatch: {
        songName: "Blinding Lights",
        artist: "The Weeknd",
        album: "After Hours",
        genre: "Pop",
        platformLinks: { youtube: "https://youtube.com/watch?v=abc" },
        youtubeVideoId: "abc",
        releaseYear: 2020,
        source: "provider",
        verificationStatus: "verified",
      },
      alternatives: [],
    }),
    addToQueue: (track) => queued.push(track),
  });

  assert.equal(result.primaryMatch.youtubeVideoId, "abc");
  assert.equal(queued.length, 1);
});
