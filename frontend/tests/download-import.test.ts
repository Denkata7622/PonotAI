import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToString } from "react-dom/server";
import { LanguageProvider } from "../lib/LanguageContext";
import SongReviewModal from "../components/SongReviewModal";
import { parseImportedSongs, SongImportError } from "../app/download/DownloadClient";

test("download JSON import parser accepts valid song arrays", () => {
  const songs = parseImportedSongs([
    { title: "Midnight Run", artist: "Nova", coverUrl: "https://cdn.example.test/cover.jpg" },
    "Artist - Title",
  ]);

  assert.equal(songs.length, 2);
  assert.equal(songs[0]?.songName, "Midnight Run");
  assert.equal(songs[0]?.artist, "Nova");
  assert.equal(songs[1]?.songName, "Title");
  assert.equal(songs[1]?.artist, "Artist");
});

test("download JSON import parser rejects unknown schema with actionable error", () => {
  assert.throws(() => parseImportedSongs({ tracks: [] }), (error: unknown) => {
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
