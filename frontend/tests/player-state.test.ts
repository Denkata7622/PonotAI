import test from "node:test";
import assert from "node:assert/strict";
import { getNextQueueIndex, getNextQueueIndexAdvanced, percentToDurationSeconds, shouldCommitScrub, shouldLoadVideoById, upsertTrack } from "../features/player/state.ts";

const trackA = { id: "a", title: "A", artist: "AA", artistId: "aa", artworkUrl: "", query: "A AA", license: "UNKNOWN" as const };
const trackB = { id: "b", title: "B", artist: "BB", artistId: "bb", artworkUrl: "", query: "B BB", license: "UNKNOWN" as const };

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

test("getNextQueueIndexAdvanced keeps straight next behavior when shuffle is off", () => {
  assert.equal(getNextQueueIndexAdvanced({ currentIndex: 0, queueLength: 3, repeatMode: "normal", shuffleEnabled: false }), 1);
});

test("getNextQueueIndexAdvanced lets repeat track override shuffle", () => {
  assert.equal(getNextQueueIndexAdvanced({ currentIndex: 1, queueLength: 3, repeatMode: "track", shuffleEnabled: true }), 1);
});

test("getNextQueueIndexAdvanced with one item stops in normal mode when shuffle is enabled", () => {
  assert.equal(getNextQueueIndexAdvanced({ currentIndex: 0, queueLength: 1, repeatMode: "normal", shuffleEnabled: true }), null);
});

test("getNextQueueIndexAdvanced with one item repeats in repeat queue mode when shuffle is enabled", () => {
  assert.equal(getNextQueueIndexAdvanced({ currentIndex: 0, queueLength: 1, repeatMode: "queue", shuffleEnabled: true }), 0);
});

test("getNextQueueIndexAdvanced picks non-current item when shuffle is on", () => {
  const next = getNextQueueIndexAdvanced({
    currentIndex: 1,
    queueLength: 4,
    repeatMode: "queue",
    shuffleEnabled: true,
    randomIndex: () => 0,
  });
  assert.notEqual(next, 1);
});

test("getNextQueueIndexAdvanced stops in normal shuffle mode after all playable items were played", () => {
  assert.equal(
    getNextQueueIndexAdvanced({
      currentIndex: 2,
      queueLength: 3,
      repeatMode: "normal",
      shuffleEnabled: true,
      playedIndices: [0, 1, 2],
      randomIndex: () => 0,
    }),
    null,
  );
});

test("getNextQueueIndexAdvanced keeps returning random items in repeat queue shuffle mode", () => {
  const next = getNextQueueIndexAdvanced({
    currentIndex: 2,
    queueLength: 3,
    repeatMode: "queue",
    shuffleEnabled: true,
    playedIndices: [0, 1, 2],
    randomIndex: () => 0,
  });
  assert.equal(next, 0);
});

test("shouldLoadVideoById guards duplicate loadVideoById calls unless forced", () => {
  assert.equal(shouldLoadVideoById("sameVideo", "sameVideo"), false);
  assert.equal(shouldLoadVideoById("sameVideo", "sameVideo", true), true);
  assert.equal(shouldLoadVideoById("oldVideo", "newVideo"), true);
  assert.equal(shouldLoadVideoById("oldVideo", null), false);
});

test("percentToDurationSeconds clamps scrub percentages to duration bounds", () => {
  assert.equal(percentToDurationSeconds(50, 200), 100);
  assert.equal(percentToDurationSeconds(-10, 200), 0);
  assert.equal(percentToDurationSeconds(130, 200), 200);
  assert.equal(percentToDurationSeconds(30, 0), 0);
});

test("shouldCommitScrub prevents duplicate commit events for the same drag token", () => {
  assert.equal(shouldCommitScrub(1, 0), true);
  assert.equal(shouldCommitScrub(1, 1), false);
  assert.equal(shouldCommitScrub(2, 1), true);
  assert.equal(shouldCommitScrub(0, 0), false);
});
