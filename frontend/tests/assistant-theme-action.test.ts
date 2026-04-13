import test from "node:test";
import assert from "node:assert/strict";
import { normalizeThemeActionPayload } from "../src/features/assistant/themeAction";

test("assistant theme action maps supported options", () => {
  const parsed = normalizeThemeActionPayload({ theme: "dark", accent: "emerald", density: "compact", intensity: "vivid", surfaceStyle: "elevated" });
  assert.deepEqual(parsed, { theme: "dark", accent: "emerald", density: "compact", intensity: "vivid", surfaceStyle: "elevated", radius: undefined, sidebarStyle: undefined, motionLevel: undefined, chartStyle: undefined });
});

test("assistant theme action drops unsupported values", () => {
  const parsed = normalizeThemeActionPayload({ theme: "neon", accent: "midnight", density: "dense", chartStyle: "rainbow" });
  assert.deepEqual(parsed, { theme: undefined, accent: undefined, density: undefined, surfaceStyle: undefined, radius: undefined, sidebarStyle: undefined, motionLevel: undefined, intensity: undefined, chartStyle: undefined });
});
