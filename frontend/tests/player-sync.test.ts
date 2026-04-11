import test from "node:test";
import assert from "node:assert/strict";
import { mapYouTubeState } from "../features/player/state.ts";

const ytStates = {
  PLAYING: 1,
  PAUSED: 2,
  ENDED: 0,
  CUED: 5,
  BUFFERING: 3,
};

test("mapYouTubeState keeps UI in sync when iframe reports paused while UI expected playing", () => {
  const snapshot = mapYouTubeState(ytStates.PAUSED, ytStates);
  assert.equal(snapshot.isPlaying, false);
  assert.equal(snapshot.isBuffering, false);
  assert.equal(snapshot.ended, false);
});

test("mapYouTubeState marks buffering independently of play icon", () => {
  const snapshot = mapYouTubeState(ytStates.BUFFERING, ytStates);
  assert.equal(snapshot.isPlaying, false);
  assert.equal(snapshot.isBuffering, true);
  assert.equal(snapshot.ended, false);
});

test("mapYouTubeState handles ended event for UI reset", () => {
  const snapshot = mapYouTubeState(ytStates.ENDED, ytStates);
  assert.equal(snapshot.isPlaying, false);
  assert.equal(snapshot.isBuffering, false);
  assert.equal(snapshot.ended, true);
});
