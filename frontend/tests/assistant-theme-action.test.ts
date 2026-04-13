import test from "node:test";
import assert from "node:assert/strict";
import { hasApplicableThemeChange, normalizeThemeActionPayload } from "../src/features/assistant/themeAction";

test("assistant theme action maps supported options", () => {
  const parsed = normalizeThemeActionPayload({ theme: "dark", accent: "emerald", density: "compact", intensity: "vivid", surfaceStyle: "elevated" });
  assert.deepEqual(parsed, { theme: "dark", accent: "emerald", density: "compact", intensity: "vivid", surfaceStyle: "elevated", radius: undefined, sidebarStyle: undefined, motionLevel: undefined, chartStyle: undefined, template: undefined });
  assert.equal(hasApplicableThemeChange(parsed), true);
});

test("assistant theme action drops unsupported values", () => {
  const parsed = normalizeThemeActionPayload({ theme: "neon", accent: "midnight", density: "dense", chartStyle: "rainbow" });
  assert.deepEqual(parsed, { theme: undefined, accent: undefined, density: undefined, surfaceStyle: undefined, radius: undefined, sidebarStyle: undefined, motionLevel: undefined, intensity: undefined, chartStyle: undefined, template: undefined });
  assert.equal(hasApplicableThemeChange(parsed), false);
});

test("assistant theme action resolves template ids to actual supported runtime values", () => {
  const parsed = normalizeThemeActionPayload({ template: "sunset-glow", theme: "dark" });
  assert.equal(parsed.template, "sunset-glow");
  assert.equal(parsed.theme, "dark");
  assert.equal(parsed.accent, "sunset");
  assert.equal(parsed.density, "comfortable");
});

test("unsupported template ids are not emitted as executable changes", () => {
  const parsed = normalizeThemeActionPayload({ template: "made-up-theme" });
  assert.equal(parsed.template, undefined);
  assert.equal(hasApplicableThemeChange(parsed), false);
});
