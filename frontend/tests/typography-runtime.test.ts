import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { UI_PRESETS } from "../lib/ThemeContext";
import { BODY_FONT_OPTIONS, DISPLAY_FONT_OPTIONS, DISPLAY_TEXT_STYLE_OPTIONS, TEXT_SCALE_OPTIONS } from "../lib/typographyConfig";

test("typography presets use only supported runtime options", () => {
  for (const preset of Object.values(UI_PRESETS)) {
    assert.ok(BODY_FONT_OPTIONS.includes(preset.bodyFont));
    assert.ok(DISPLAY_FONT_OPTIONS.includes(preset.displayFont));
    assert.ok(DISPLAY_TEXT_STYLE_OPTIONS.includes(preset.displayTextStyle));
    assert.ok(TEXT_SCALE_OPTIONS.includes(preset.textScale));
  }
});

test("preset switching payload always has full typography fields", () => {
  for (const [name, preset] of Object.entries(UI_PRESETS)) {
    assert.equal(typeof preset.bodyFont, "string", `${name} missing bodyFont`);
    assert.equal(typeof preset.displayFont, "string", `${name} missing displayFont`);
    assert.equal(typeof preset.displayTextStyle, "string", `${name} missing displayTextStyle`);
    assert.equal(typeof preset.textScale, "string", `${name} missing textScale`);
  }
});

test("expressive display styles remain scoped to display selectors", () => {
  const css = fs.readFileSync(path.join(process.cwd(), "app", "globals.css"), "utf8");
  assert.match(css, /data-display-style="cyber-pulse"\] :where\(\.type-display, \.display-styled\)/);
  assert.doesNotMatch(css, /data-display-style="cyber-pulse"\] :where\(body/i);
});
