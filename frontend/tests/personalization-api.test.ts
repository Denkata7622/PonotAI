import assert from "node:assert/strict";
import test from "node:test";
import {
  PersonalizationApiError,
  getPersonalizationPreferences,
  getPersonalizationRecommendations,
  resolveThemeRecommendationPresetId,
  savePersonalizationPreferences,
  type PersonalizationRecommendation,
} from "../src/features/personalization/api";

test("personalization API client rejects non-2xx responses with useful status", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ code: "INVALID_THEME_PRESET_ID", message: "Invalid preset" }), {
    status: 400,
    headers: { "content-type": "application/json" },
  });
  try {
    await assert.rejects(
      () => savePersonalizationPreferences({ themePresetId: "Cyber Grid" }),
      (error: unknown) => {
        assert.ok(error instanceof PersonalizationApiError);
        assert.equal(error.status, 400);
        assert.equal(error.code, "INVALID_THEME_PRESET_ID");
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("personalization API client normalizes recommendation preset IDs", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    ok: true,
    recommendations: [
      { id: "theme:cyber-grid", kind: "theme", title: "Try Cyber Grid", description: "Real preset", presetId: "Cyber Grid" },
      { id: "theme:missing", kind: "theme", title: "Try Missing", description: "Invalid preset", presetId: "Made Up Preset" },
      { id: "setting:unsafe", kind: "setting", title: "Unsafe action", description: "Malformed action", action: { type: "launch_missiles", label: "Nope" } },
    ],
  }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
  try {
    const payload = await getPersonalizationRecommendations(null);
    assert.equal(payload.recommendations.length, 3);
    assert.equal(resolveThemeRecommendationPresetId(payload.recommendations[0] as PersonalizationRecommendation), "Cyber Grid");
    assert.equal(resolveThemeRecommendationPresetId(payload.recommendations[1] as PersonalizationRecommendation), null);
    assert.equal(payload.recommendations[2]?.action, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("personalization API client falls back safely for invalid saved theme IDs", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    ok: true,
    preferences: { themePresetId: "Made Up Preset", updatedAt: "2026-05-19T00:00:00.000Z" },
    source: "database",
  }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
  try {
    const payload = await getPersonalizationPreferences();
    assert.equal(payload.preferences.themePresetId, null);
    assert.equal(payload.source, "database");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
