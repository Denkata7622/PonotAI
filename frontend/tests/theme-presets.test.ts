import assert from "node:assert/strict";
import test from "node:test";
import { applyAccentVariables, UI_PRESETS, themeStorageKeys } from "../lib/ThemeContext";
import { getAccentCssVariables, normalizeAccentPreset } from "../lib/themePresets";

test("normalizeAccentPreset falls back for unsupported accent values", () => {
  assert.equal(normalizeAccentPreset("ocean"), "ocean");
  assert.equal(normalizeAccentPreset("midnight"), "violet");
});

test("getAccentCssVariables returns expanded UI token variables", () => {
  const cssVars = getAccentCssVariables("emerald", "vivid", "multicolor");
  assert.equal(cssVars["--accent"], "#10b981");
  assert.ok(cssVars["--accent-ring"].includes("16, 185, 129"));
  assert.ok(cssVars["--chart-2"]);
});

test("applyAccentVariables writes accent data and css variables to root", () => {
  const values = new Map<string, string>();
  const root = {
    setAttribute: (key: string, value: string) => values.set(key, value),
    style: {
      setProperty: (key: string, value: string) => values.set(key, value),
    },
  };
  Object.defineProperty(globalThis, "document", { value: { documentElement: root }, configurable: true });

  applyAccentVariables("ruby", "subtle", "neutral");

  assert.equal(values.get("data-accent"), "ruby");
  assert.equal(values.get("--accent"), "#be123c");
  assert.ok(values.get("--accent-soft")?.includes("190, 18, 60"));
});


test("theme storage includes typography split keys", () => {
  assert.equal(themeStorageKeys.cardEmphasis, "ponotai-card-emphasis");
  assert.equal(themeStorageKeys.chartStyle, "ponotai-chart-style");
  assert.equal(themeStorageKeys.bodyFont, "ponotai-body-font");
  assert.equal(themeStorageKeys.displayFont, "ponotai-display-font");
  assert.equal(themeStorageKeys.displayTextStyle, "ponotai-display-text-style");
});

test("ui presets define expressive typography for all templates", () => {
  for (const preset of Object.values(UI_PRESETS)) {
    assert.ok(["static", "soft-gradient", "subtle-glow", "slight-depth", "cyber-pulse", "shadowed-poster"].includes(preset.displayTextStyle));
    assert.ok(typeof preset.bodyFont === "string");
    assert.ok(typeof preset.displayFont === "string");
  }
});

test("creative presets are registered", () => {
  assert.equal(UI_PRESETS["Stock Clean"]?.theme, "light");
  assert.equal(UI_PRESETS["Cyber Grid"]?.displayFont, "orbitron");
  assert.equal(UI_PRESETS["Noir Gothic"]?.displayFont, "pirata-one");
});
