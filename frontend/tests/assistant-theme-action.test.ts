import test from "node:test";
import assert from "node:assert/strict";
import { normalizeThemeActionPayload } from "../src/features/assistant/themeAction";

test("assistant theme action only maps supported options", () => {
  const parsed = normalizeThemeActionPayload({ theme: "dark", accent: "emerald", density: "compact" });
  assert.deepEqual(parsed, { theme: "dark", accent: "emerald", density: "compact" });
});

test("assistant theme action drops unsupported values", () => {
  const parsed = normalizeThemeActionPayload({ theme: "neon", accent: "midnight", density: "dense" });
  assert.deepEqual(parsed, { theme: undefined, accent: undefined, density: undefined });
});
