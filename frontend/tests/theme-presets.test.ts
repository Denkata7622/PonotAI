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


test("theme storage includes advanced personalization keys", () => {
  assert.equal(themeStorageKeys.cardEmphasis, "ponotai-card-emphasis");
  assert.equal(themeStorageKeys.chartStyle, "ponotai-chart-style");
});

test("ui presets define card emphasis for all preset templates", () => {
  for (const preset of Object.values(UI_PRESETS)) {
    assert.ok(["standard", "accented", "tinted"].includes(preset.cardEmphasis));
  }
});
