import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { BODY_FONT_OPTIONS, DISPLAY_FONT_OPTIONS, DISPLAY_TEXT_STYLE_OPTIONS } from "../lib/typographyConfig";

const css = fs.readFileSync(path.join(process.cwd(), "app", "globals.css"), "utf8");
const layout = fs.readFileSync(path.join(process.cwd(), "app", "layout.tsx"), "utf8");

test("panel tint variants map to panel tokens consumed by panel surfaces", () => {
  assert.match(css, /data-panel-tint="off"/);
  assert.match(css, /data-panel-tint="subtle"/);
  assert.match(css, /data-panel-tint="rich"/);
  assert.match(css, /--panel-surface:/);
  assert.match(css, /\.dropdown-surface\s*{[^}]*var\(--panel-surface-elevated\)/s);
  assert.match(css, /\.assistant-page\s*{[^}]*var\(--panel-surface\)/s);
});

test("all display text styles are represented in css selectors", () => {
  for (const style of DISPLAY_TEXT_STYLE_OPTIONS) {
    assert.match(css, new RegExp(`data-display-style="${style}"`));
  }
  assert.match(css, /data-display-style="cyber-pulse".*animation/s);
});

test("surface style variants define visible depth token differences", () => {
  assert.match(css, /data-surface="flat"/);
  assert.match(css, /data-surface="soft"/);
  assert.match(css, /data-surface="elevated"/);
  assert.match(css, /data-surface="flat"[\s\S]*--card-shadow-soft:/);
  assert.match(css, /data-surface="elevated"[\s\S]*--shadow-raised:/);
  assert.match(css, /\.card-base\s*{[\s\S]*box-shadow: var\(--card-shadow-soft\)/);
});

test("every exposed body and display font has runtime css mapping", () => {
  for (const font of BODY_FONT_OPTIONS) {
    assert.match(css, new RegExp(`data-body-font="${font}"`));
  }
  for (const font of DISPLAY_FONT_OPTIONS) {
    assert.match(css, new RegExp(`data-display-font="${font}"`));
  }
});

test("display font options are available as body font options too", () => {
  for (const font of DISPLAY_FONT_OPTIONS) {
    assert.ok(BODY_FONT_OPTIONS.includes(font), `${font} should be in body font options`);
  }
});

test("bootstrap uses shared body and display font allowlists", () => {
  assert.match(layout, /supportedBodyFonts=\$\{supportedBodyFonts\}/);
  assert.match(layout, /supportedDisplayFonts=\$\{supportedDisplayFonts\}/);
  assert.match(layout, /supportedDisplayStyles=\$\{supportedDisplayStyles\}/);
});
