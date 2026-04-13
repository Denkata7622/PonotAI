import test from "node:test";
import assert from "node:assert/strict";
import { interpretOcr, type OcrBlock } from "../src/modules/recognition/ocrInterpreter.ts";

function block(text: string, x: number, y: number, width: number, height: number, confidence = 92): OcrBlock {
  return { text, confidence, bbox: { x, y, width, height } };
}

test("extracts title and artist from Spotify-like now playing layout", () => {
  const result = interpretOcr([
    block("12:01", 20, 20, 50, 10, 90),
    block("Blinding", 180, 420, 220, 58),
    block("Lights", 408, 420, 140, 58),
    block("The Weeknd", 182, 496, 250, 42),
    block("Shuffle", 35, 650, 90, 18, 89),
  ]);

  assert.equal(result.music?.title, "Blinding Lights");
  assert.equal(result.music?.artist, "The Weeknd");
  assert.ok((result.music?.confidenceScore ?? 0) >= 0.6);
});

test("extracts title and artist from Instagram-style music share", () => {
  const result = interpretOcr([
    block("@alex", 100, 100, 70, 20, 95),
    block("Starboy", 105, 210, 220, 52),
    block("The Weeknd & Daft Punk", 106, 276, 320, 38),
    block("Add Yours", 460, 60, 90, 18, 86),
  ]);

  assert.equal(result.music?.title, "Starboy");
  assert.equal(result.music?.artist, "The Weeknd & Daft Punk");
});

test("does not force music extraction for notes-like screenshot", () => {
  const result = interpretOcr([
    block("Shopping list", 40, 80, 180, 26),
    block("milk eggs bread coffee", 40, 130, 320, 24),
    block("call Mike tomorrow", 40, 170, 280, 24),
    block("finish project outline", 40, 210, 300, 24),
    block("book dentist appointment", 40, 250, 320, 24),
  ]);

  assert.equal(result.music, undefined);
  assert.ok(result.lines.length >= 4);
});

test("does not return music object on random general UI text", () => {
  const result = interpretOcr([
    block("Settings", 30, 30, 90, 22),
    block("Wi-Fi", 40, 120, 60, 20),
    block("Battery", 40, 170, 75, 20),
    block("Notifications", 40, 220, 120, 20),
    block("Version 14.2.1", 40, 320, 130, 20),
  ]);

  assert.equal(result.music, undefined);
});

test("filters low confidence lines and returns no music", () => {
  const result = interpretOcr([
    block("Levitating", 180, 220, 200, 54, 35),
    block("Dua Lipa", 182, 286, 180, 40, 38),
    block("11:11", 20, 20, 45, 10, 91),
  ]);

  assert.equal(result.music, undefined);
  assert.equal(result.lines.length, 0);
});

test("reconstructs merged lines from nearby word blocks", () => {
  const result = interpretOcr([
    block("One", 140, 260, 80, 50),
    block("More", 229, 260, 90, 50),
    block("Time", 328, 260, 80, 50),
    block("Daft", 142, 324, 80, 40),
    block("Punk", 228, 324, 85, 40),
  ]);

  assert.equal(result.music?.title, "One More Time");
  assert.equal(result.music?.artist, "Daft Punk");
});

test("supports non-latin title and artist extraction", () => {
  const result = interpretOcr([
    block("夜に駆ける", 180, 260, 240, 52),
    block("YOASOBI", 182, 326, 180, 40),
    block("0:30", 22, 20, 40, 11),
  ]);

  assert.equal(result.music?.title, "夜に駆ける");
  assert.equal(result.music?.artist, "YOASOBI");
});

test("splits title and artist from same line with dash", () => {
  const result = interpretOcr([
    block("Numb - Linkin Park", 120, 230, 350, 54),
    block("Story", 40, 40, 60, 20),
  ]);

  assert.equal(result.music?.title, "Numb");
  assert.equal(result.music?.artist, "Linkin Park");
});

test("keeps compact screenshot rows separated for list-style OCR layouts", () => {
  const result = interpretOcr([
    block("Anti-Hero", 88, 120, 220, 24),
    block("Taylor Swift", 92, 148, 210, 22),
    block("Flowers", 88, 182, 170, 24),
    block("Miley Cyrus", 92, 210, 190, 22),
    block("As It Was", 88, 244, 170, 24),
    block("Harry Styles", 92, 272, 200, 22),
  ]);

  assert.ok(result.lines.length >= 6);
  assert.equal(result.lines.some((line) => line.text === "Anti-Hero"), true);
  assert.equal(result.lines.some((line) => line.text === "Flowers"), true);
  assert.equal(result.lines.some((line) => line.text === "As It Was"), true);
});
