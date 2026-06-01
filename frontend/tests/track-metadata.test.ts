import test from "node:test";
import assert from "node:assert/strict";
import {
  collectCoverCandidates,
  createSafeTrackFileName,
  getUniqueFileName,
  resolveTrackMetadata,
  sanitizeFileName,
} from "../lib/trackMetadata";

test("metadata cleaner parses common YouTube artist-title junk", () => {
  const cases = [
    ["Eminem - Lose Yourself (Official Music Video) [HD]", "Eminem", "Lose Yourself"],
    ["AC/DC - Thunderstruck (Official Video)", "AC/DC", "Thunderstruck"],
    ["Dua Lipa - Houdini (Official Music Video)", "Dua Lipa", "Houdini"],
    ["Artist ft. Guest - Song Title (Lyrics)", "Artist feat. Guest", "Song Title"],
    ["Song Title by Artist", "Artist", "Song Title"],
    ["Artist - Song (Official Audio)", "Artist", "Song"],
  ] as const;

  for (const [query, artist, title] of cases) {
    const metadata = resolveTrackMetadata({ query });
    assert.equal(metadata.artist, artist, query);
    assert.equal(metadata.title, title, query);
    assert.ok(metadata.cleanupApplied.length > 0, query);
  }
});

test("metadata cleaner preserves meaningful versions and non-English text", () => {
  assert.equal(resolveTrackMetadata({ query: "Artist - Song (Live at Wembley)" }).title, "Song (Live at Wembley)");
  assert.equal(resolveTrackMetadata({ query: "Artist - Song (Remastered 2011)" }).title, "Song (Remastered 2011)");

  const cyrillic = resolveTrackMetadata({
    title: "\u041C\u043E\u044F\u0442\u0430 \u043F\u0435\u0441\u0435\u043D",
    artist: "\u0418\u0437\u043F\u044A\u043B\u043D\u0438\u0442\u0435\u043B",
  });
  assert.equal(cyrillic.title, "\u041C\u043E\u044F\u0442\u0430 \u043F\u0435\u0441\u0435\u043D");
  assert.equal(cyrillic.artist, "\u0418\u0437\u043F\u044A\u043B\u043D\u0438\u0442\u0435\u043B");

  const emoji = resolveTrackMetadata({ query: "Artist - Fire \u{1F525} Song (Official Video)" });
  assert.equal(emoji.title, "Fire \u{1F525} Song");
});

test("imported title and artist win over YouTube title cleanup", () => {
  const metadata = resolveTrackMetadata({
    title: "Precise Song",
    artist: "Precise Artist",
    youtubeTitle: "Wrong Channel - Wrong Song (Official Video)",
    youtubeUploader: "Wrong Channel - Topic",
  });
  assert.equal(metadata.title, "Precise Song");
  assert.equal(metadata.artist, "Precise Artist");
  assert.equal(metadata.confidence, "high");
});

test("YouTube topic suffix is stripped from artist fallback", () => {
  const metadata = resolveTrackMetadata({ youtubeTitle: "Clean Song (Official Audio)", youtubeUploader: "Clean Artist - Topic" });
  assert.equal(metadata.artist, "Clean Artist");
  assert.equal(metadata.title, "Clean Song");
});

test("filename sanitizer is deterministic, Windows-safe, ZIP-safe, and dedupes", () => {
  const used = new Set<string>();
  const inputs = [
    "AC/DC",
    "song:name",
    "name with \"quotes\"",
    "question?mark",
    "pipe|char",
    "star*",
    "angle<brackets>",
    "CON",
    "AUX",
    "COM1",
    "LPT9",
    "../evil",
    "C:\\Users\\bad\\song",
    "",
    `${"very ".repeat(40)}long`,
  ];

  for (const input of inputs) {
    const fileName = getUniqueFileName(`${sanitizeFileName(input)}.mp3`, used);
    assert.doesNotMatch(fileName, /[<>:"/\\|?*\u0000-\u001f]/);
    assert.doesNotMatch(fileName, /^[a-zA-Z]:/);
    assert.doesNotMatch(fileName, /[. ]+$/);
    assert.doesNotMatch(fileName.replace(/\.mp3$/i, ""), /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i);
    assert.ok(fileName.length <= 124);
  }

  assert.equal(getUniqueFileName("Artist - Song.mp3", used), "Artist - Song.mp3");
  assert.equal(getUniqueFileName("Artist - Song.mp3", used), "Artist - Song (2).mp3");
  assert.equal(createSafeTrackFileName({ artist: "AC/DC", title: "Thunder:struck?" }), "AC DC - Thunder struck.mp3");
});

test("cover candidates prefer imported artwork before YouTube thumbnails", () => {
  const candidates = collectCoverCandidates({
    raw: { artworkUrl: "https://img.example.test/import.jpg" },
    youtubeInfo: {
      thumbnail: "https://img.youtube.test/default.jpg",
      thumbnails: [
        { url: "https://img.youtube.test/small.jpg", width: 120, height: 90 },
        { url: "https://img.youtube.test/large.jpg", width: 720, height: 720 },
      ],
    },
  });

  assert.equal(candidates[0]?.url, "https://img.example.test/import.jpg");
  assert.equal(candidates[0]?.source, "import");
  assert.equal(candidates.some((candidate) => candidate.url === "https://img.youtube.test/large.jpg"), true);
  assert.equal(collectCoverCandidates({ raw: { coverUrl: "javascript:alert(1)" } }).length, 0);
});
