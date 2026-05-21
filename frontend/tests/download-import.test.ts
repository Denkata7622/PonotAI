import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { LanguageProvider } from "../lib/LanguageContext";
import SongReviewModal from "../components/SongReviewModal";
import { parseImportedSongs, parseImportedSongsDetailed, parseImportedSongsText, SongImportError } from "../app/download/DownloadClient";

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(path.join(process.cwd(), "tests", "fixtures", name), "utf8")) as unknown;
}

test("download JSON import parser accepts valid song arrays", () => {
  const songs = parseImportedSongs(fixture("valid-songs-array.json"));

  assert.equal(songs.length, 2);
  assert.equal(songs[0]?.songName, "Get Lucky");
  assert.equal(songs[0]?.artist, "Daft Punk");
  assert.equal(songs[1]?.songName, "Blinding Lights");
  assert.equal(songs[1]?.artist, "The Weeknd");
});

test("download JSON import parser accepts songs object fixture and keeps YouTube fields", () => {
  const detailed = parseImportedSongsDetailed(fixture("valid-songs-object.json"));

  assert.equal(detailed.songs.length, 2);
  assert.equal(detailed.invalidItems.length, 0);
  assert.equal(detailed.songs[0]?.youtubeVideoId, "5NV6Rdv1a3I");
  assert.equal((detailed.songs[1] as { youtubeUrl?: string }).youtubeUrl, "https://www.youtube.com/watch?v=4NRXx6U8ABQ");
});

test("download JSON import parser accepts results object fixture and OCR aliases", () => {
  const detailed = parseImportedSongsDetailed(fixture("download-songs-object.json"));

  assert.equal(detailed.songs.length, 2);
  assert.equal(detailed.songs[0]?.songName, "Sweet Disposition");
  assert.equal(detailed.songs[0]?.artist, "The Temper Trap");
  assert.equal((detailed.songs[0] as { youtubeUrl?: string }).youtubeUrl, "https://youtu.be/vN7HQrgakZU?si=test");
  assert.equal(detailed.songs[1]?.songName, "Safe and Sound");
  assert.equal(detailed.songs[1]?.artist, "Capital Cities");
  assert.equal((detailed.songs[1] as { audioUrl?: string }).audioUrl, "https://cdn.example.test/safe-and-sound.mp3");
});

test("download JSON import parser accepts matches object and platform links", () => {
  const detailed = parseImportedSongsDetailed(fixture("download-songs-platform-links.json"));

  assert.equal(detailed.songs.length, 2);
  assert.equal(detailed.songs[0]?.songName, "Electric Feel");
  assert.equal((detailed.songs[0] as { youtubeUrl?: string }).youtubeUrl, "https://www.youtube.com/watch?v=MmZexg8sxyk");
  assert.equal((detailed.songs[0]?.platformLinks as { spotify?: string }).spotify, "https://open.spotify.com/track/test");
  assert.equal(detailed.songs[1]?.songName, "Empire of the Sun - Walking on a Dream");
  assert.equal((detailed.songs[1] as { audioUrl?: string }).audioUrl, "https://cdn.example.test/walking.mp3");
});

test("download JSON import parser accepts array fixture with track/artists/youtubeId aliases", () => {
  const songs = parseImportedSongs(fixture("download-songs-array.json"));

  assert.equal(songs.length, 2);
  assert.equal(songs[1]?.songName, "Midnight City");
  assert.equal(songs[1]?.artist, "M83");
  assert.equal(songs[1]?.youtubeVideoId, "dX3k_QDnzHE");
});

test("download JSON import parser reports partial rows without dropping valid songs", () => {
  const detailed = parseImportedSongsDetailed(fixture("download-songs-invalid-partial.json"));

  assert.equal(detailed.songs.length, 1);
  assert.equal(detailed.invalidItems.length, 2);
  assert.equal(detailed.skippedCount, 1);
  assert.match(detailed.invalidItems.join("\n"), /missing a usable title/);
});

test("download JSON import parser rejects malformed JSON text", () => {
  assert.throws(() => parseImportedSongsText("{"), (error: unknown) => {
    assert.ok(error instanceof SongImportError);
    assert.equal(error.code, "invalid-json");
    return true;
  });
});

test("download JSON import parser rejects unknown schema with actionable error", () => {
  assert.throws(() => parseImportedSongs(fixture("invalid-songs.json")), (error: unknown) => {
    assert.ok(error instanceof SongImportError);
    assert.equal(error.code, "invalid-schema");
    assert.match(error.message, /songs, results, or matches array/);
    return true;
  });
});

test("download JSON import parser explains empty or invalid items", () => {
  assert.throws(() => parseImportedSongs([{ artist: "No Title" }]), (error: unknown) => {
    assert.ok(error instanceof SongImportError);
    assert.equal(error.code, "empty-import");
    assert.match(error.message, /missing a usable title/);
    return true;
  });
});

test("SongReviewModal render does not throw when production API URL is missing", () => {
  const snapshot = {
    base: process.env.NEXT_PUBLIC_API_BASE_URL,
    server: process.env.TRACKLY_API_BASE_URL,
    node: process.env.NODE_ENV,
  };
  try {
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
    delete process.env.TRACKLY_API_BASE_URL;
    process.env.NODE_ENV = "production";

    assert.doesNotThrow(() => renderToString(
      React.createElement(LanguageProvider, null,
        React.createElement(SongReviewModal, {
          songs: [{
            songName: "Midnight Run",
            artist: "Nova",
            album: "Unknown Album",
            genre: "",
            releaseYear: null,
            platformLinks: {},
            albumArtUrl: "",
            confidence: 1,
            durationSec: 0,
          }],
          onConfirm: () => undefined,
          onCancel: () => undefined,
        }),
      ),
    ));
  } finally {
    if (snapshot.base === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL;
    else process.env.NEXT_PUBLIC_API_BASE_URL = snapshot.base;
    if (snapshot.server === undefined) delete process.env.TRACKLY_API_BASE_URL;
    else process.env.TRACKLY_API_BASE_URL = snapshot.server;
    if (snapshot.node === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = snapshot.node;
  }
});
