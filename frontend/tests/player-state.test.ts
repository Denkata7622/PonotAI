import test from "node:test";
import assert from "node:assert/strict";
import { getNextQueueIndex, upsertTrack } from "../features/player/state.ts";

const trackA = { id: "a", title: "A", artist: "AA", query: "A AA" };
const trackB = { id: "b", title: "B", artist: "BB", query: "B BB" };

test("upsertTrack adds new tracks and sets active index", () => {
  const first = upsertTrack([], trackA);
  assert.equal(first.queue.length, 1);
  assert.equal(first.activeIndex, 0);
  assert.equal(first.added, true);

  const second = upsertTrack(first.queue, trackB);
  assert.equal(second.queue.length, 2);
  assert.equal(second.activeIndex, 1);
  assert.equal(second.added, true);
});

test("upsertTrack prevents duplicates and focuses existing item", () => {
  const first = upsertTrack([trackA, trackB], trackA);
  assert.equal(first.queue.length, 2);
  assert.equal(first.activeIndex, 0);
  assert.equal(first.added, false);
});

test("getNextQueueIndex handles normal queue ending", () => {
  assert.equal(getNextQueueIndex(0, 2, "normal"), 1);
  assert.equal(getNextQueueIndex(1, 2, "normal"), null);
});

test("getNextQueueIndex loops queue when repeat queue is active", () => {
  assert.equal(getNextQueueIndex(1, 2, "queue"), 0);
});

test("getNextQueueIndex repeats current track when repeat track is active", () => {
  assert.equal(getNextQueueIndex(1, 2, "track"), 1);
});
