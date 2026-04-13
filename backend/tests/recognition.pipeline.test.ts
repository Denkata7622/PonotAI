import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAttemptContext,
  withAttemptDedupe,
  hashAudioBuffer,
  classifyProviderError,
  markProviderFailure,
  isProviderBlocked,
} from "../src/modules/recognition/recognition.guard.ts";

test("attempt budgets are bounded by mode", () => {
  const hash = hashAudioBuffer(Buffer.from("abc"));
  const standard = buildAttemptContext({ mode: "standard", audioHash: hash, userId: "u1" });
  const live = buildAttemptContext({ mode: "live", audioHash: hash, userId: "u1" });

  assert.equal(standard.budget.maxProviderCalls, 2);
  assert.equal(standard.budget.maxMetadataCalls, 1);
  assert.equal(live.budget.maxProviderCalls, 3);
  assert.equal(live.budget.maxMetadataCalls, 2);
});

test("dedupe key shares in-flight promise", async () => {
  const hash = hashAudioBuffer(Buffer.from("same"));
  const ctx = buildAttemptContext({ mode: "standard", audioHash: hash, userId: "u1" });

  let runs = 0;
  const run = () => withAttemptDedupe(ctx, async () => {
    runs += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return {
      songName: "Song",
      artist: "Artist",
      album: "Album",
      genre: "Genre",
      confidenceScore: 0.8,
      platformLinks: {},
      releaseYear: null,
      source: "provider" as const,
      verificationStatus: "not_found" as const,
    };
  });

  const [a, b] = await Promise.all([run(), run()]);
  assert.equal(a.songName, "Song");
  assert.equal(b.songName, "Song");
  assert.equal(runs, 1);
});

test("quota and overload errors open provider circuit", () => {
  assert.equal(classifyProviderError(new Error("quota exceeded 429")), "quota");
  assert.equal(classifyProviderError(new Error("service overload 503")), "overload");

  markProviderFailure("acrcloud", "quota");
  assert.equal(isProviderBlocked("acrcloud"), true);
});
