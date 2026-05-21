import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { LanguageProvider } from "../lib/LanguageContext";
import SongReviewModal from "../components/SongReviewModal";
import { parseImportedSongs, parseImportedSongsDetailed, SongImportError } from "../app/download/DownloadClient";

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

test("download JSON import parser rejects unknown schema with actionable error", () => {
  assert.throws(() => parseImportedSongs(fixture("invalid-songs.json")), (error: unknown) => {
    assert.ok(error instanceof SongImportError);
    assert.equal(error.code, "invalid-schema");
    assert.match(error.message, /array of songs|songs array/);
    return true;
  });
});

test("download JSON import parser explains empty or invalid items", () => {
  assert.throws(() => parseImportedSongs([{ artist: "No Title" }]), (error: unknown) => {
    assert.ok(error instanceof SongImportError);
    assert.equal(error.code, "empty-import");
    assert.match(error.message, /missing songName\/title\/name/);
    return true;
  });
});

test("SongReviewModal render does not throw when production API URL is missing", () => {
  const snapshot = {
    base: process.env.NEXT_PUBLIC_API_BASE_URL,
    alt: process.env.NEXT_PUBLIC_API_URL,
    node: process.env.NODE_ENV,
  };
  try {
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
    delete process.env.NEXT_PUBLIC_API_URL;
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
    if (snapshot.alt === undefined) delete process.env.NEXT_PUBLIC_API_URL;
    else process.env.NEXT_PUBLIC_API_URL = snapshot.alt;
    if (snapshot.node === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = snapshot.node;
  }
});
