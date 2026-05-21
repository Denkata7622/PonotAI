import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPersonalizationRecommendations,
  normalizePersonalizationPatch,
  toPersonalizationPreferences,
} from "../src/modules/personalization/personalization.service.ts";
import { isValidThemePresetId, THEME_PRESET_IDS } from "../src/modules/personalization/themePresetCatalog.ts";
import type { UserRecord } from "../src/db/authStore.ts";

const baseUser: UserRecord = {
  id: "user-1",
  username: "listener",
  email: "listener@example.com",
  passwordHash: "hash",
  recommendationDataSharingEnabled: false,
  recommendationMode: "balanced",
  repeatedArtistTolerance: "normal",
  energyPreference: "mixed",
  themePresetId: null,
  role: "user",
  isDemo: false,
  createdAt: "2026-05-19T00:00:00.000Z",
  updatedAt: "2026-05-19T00:00:00.000Z",
};

test("personalization preferences return local default when no preset is saved", () => {
  assert.deepEqual(toPersonalizationPreferences(baseUser), {
    themePresetId: null,
    updatedAt: "2026-05-19T00:00:00.000Z",
  });
});

test("personalization patch accepts every real preset ID and rejects invalid input", () => {
  const current = toPersonalizationPreferences(baseUser);
  for (const presetId of THEME_PRESET_IDS) {
    const valid = normalizePersonalizationPatch({ themePresetId: presetId }, current);
    assert.equal(valid.ok, true);
    assert.equal(valid.ok ? valid.preferences.themePresetId : null, presetId);
  }

  const invalid = normalizePersonalizationPatch({ themePresetId: "Made Up Preset" }, current);
  assert.equal(invalid.ok, false);
  assert.equal(invalid.ok ? "" : invalid.code, "INVALID_THEME_PRESET_ID");

  const unknownField = normalizePersonalizationPatch({ themePresetId: "cyber-grid", displayName: "drift" }, current);
  assert.equal(unknownField.ok, false);
  assert.equal(unknownField.ok ? "" : unknownField.code, "INVALID_PERSONALIZATION_PATCH");

  const arrayBody = normalizePersonalizationPatch([], current);
  assert.equal(arrayBody.ok, false);
  assert.equal(arrayBody.ok ? "" : arrayBody.code, "INVALID_PERSONALIZATION_PATCH");
});

test("personalization recommendations use only registered preset IDs", () => {
  const recommendations = buildPersonalizationRecommendations({
    user: { ...baseUser, recommendationMode: "mostly_discovery", energyPreference: "more_energetic" },
    currentThemePresetId: "ai-minimal",
  });
  assert.ok(recommendations.length >= 3);
  for (const recommendation of recommendations) {
    if (recommendation.kind === "theme") {
      assert.ok(isValidThemePresetId(recommendation.presetId), `${recommendation.presetId} should be valid`);
      assert.notEqual(recommendation.presetId, "ai-minimal");
    }
  }
});

test("theme preset catalog has unique stable IDs", () => {
  assert.equal(new Set(THEME_PRESET_IDS).size, THEME_PRESET_IDS.length);
  assert.ok(THEME_PRESET_IDS.includes("stock-clean"));
  assert.ok(THEME_PRESET_IDS.includes("organic-signal"));
});
