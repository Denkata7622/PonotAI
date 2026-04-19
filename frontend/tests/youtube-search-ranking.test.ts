import test from "node:test";
import assert from "node:assert/strict";
import { parseIsoDurationToSec, rankYouTubeSearchResults } from "../lib/youtubeSearchRanking";

test("parseIsoDurationToSec handles standard ISO durations", () => {
  assert.equal(parseIsoDurationToSec("PT3M40S"), 220);
  assert.equal(parseIsoDurationToSec("PT1H2M"), 3720);
  assert.equal(parseIsoDurationToSec("PT45S"), 45);
});

test("ranking penalizes compilation-style and very long uploads for single-song intent", () => {
  const ranked = rankYouTubeSearchResults("Numb Linkin Park", [
    {
      videoId: "best-match",
      title: "Linkin Park - Numb (Official Music Video)",
      channelTitle: "Linkin Park",
      thumbnailUrl: "https://img/1",
      durationSec: 187,
    },
    {
      videoId: "compilation",
      title: "Linkin Park Greatest Hits Full Album",
      channelTitle: "Rock Archives",
      thumbnailUrl: "https://img/2",
      durationSec: 4200,
    },
  ]);

  assert.equal(ranked[0]?.videoId, "best-match");
  assert.equal(ranked[1]?.kind, "other");
});

test("ranking keeps legitimate longer songs competitive when metadata is strong", () => {
  const ranked = rankYouTubeSearchResults("Tool Pneuma", [
    {
      videoId: "official",
      title: "TOOL - Pneuma (Audio)",
      channelTitle: "TOOL",
      thumbnailUrl: "https://img/1",
      durationSec: 700,
    },
    {
      videoId: "short-noise",
      title: "Pneuma edit",
      channelTitle: "random clips",
      thumbnailUrl: "https://img/2",
      durationSec: 40,
    },
  ]);

  assert.equal(ranked[0]?.videoId, "official");
  assert.equal(ranked[0]?.kind, "song");
});
