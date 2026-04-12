import assert from "node:assert/strict";
import test from "node:test";
import { applyAccentVariables } from "../lib/ThemeContext";
import { getAccentCssVariables, normalizeAccentPreset } from "../lib/themePresets";

test("normalizeAccentPreset falls back for unsupported accent values", () => {
  assert.equal(normalizeAccentPreset("ocean"), "ocean");
  assert.equal(normalizeAccentPreset("midnight"), "violet");
});

test("getAccentCssVariables returns accent variables used by UI surfaces", () => {
  const cssVars = getAccentCssVariables("emerald");
  assert.equal(cssVars["--accent"], "#10b981");
  assert.ok(cssVars["--accent-ring"].includes("16, 185, 129"));
  assert.ok(cssVars["--accent-active-bg"].includes("16, 185, 129"));
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

  applyAccentVariables("ruby");

  assert.equal(values.get("data-accent"), "ruby");
  assert.equal(values.get("--accent"), "#be123c");
  assert.ok(values.get("--accent-soft")?.includes("190, 18, 60"));
});
