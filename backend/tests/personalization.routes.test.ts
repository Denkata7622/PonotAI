import test from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers/testHarness.ts";
import { isValidThemePresetId } from "../src/modules/personalization/themePresetCatalog.ts";

test("personalization routes support guest defaults and recommendations without database user data", async () => {
  const running = await startTestServer({ persistenceMode: "file-legacy" });
  try {
    const preferencesResponse = await fetch(`${running.baseUrl}/api/personalization`);
    assert.equal(preferencesResponse.status, 200);
    const preferences = (await preferencesResponse.json()) as {
      ok: boolean;
      source: string;
      preferences: { themePresetId: string | null };
    };
    assert.equal(preferences.ok, true);
    assert.equal(preferences.source, "local-default");
    assert.equal(preferences.preferences.themePresetId, null);

    const recommendationsResponse = await fetch(`${running.baseUrl}/api/personalization/recommendations?currentThemePresetId=AI%20Minimal`);
    assert.equal(recommendationsResponse.status, 200);
    const recommendationsBody = (await recommendationsResponse.json()) as {
      ok: boolean;
      recommendations: Array<{ kind: string; presetId?: string; id: string }>;
    };
    assert.equal(recommendationsBody.ok, true);
    assert.ok(recommendationsBody.recommendations.length > 0);
    for (const recommendation of recommendationsBody.recommendations) {
      assert.equal(typeof recommendation.id, "string");
      if (recommendation.kind === "theme") {
        assert.ok(isValidThemePresetId(recommendation.presetId));
        assert.notEqual(recommendation.presetId, "AI Minimal");
      }
    }

    const invalidResponse = await fetch(`${running.baseUrl}/api/personalization/recommendations?currentThemePresetId=Made%20Up%20Preset`);
    assert.equal(invalidResponse.status, 400);

    const malformedPatch = await fetch(`${running.baseUrl}/api/personalization`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    assert.equal(malformedPatch.status, 400);
    const malformedPatchBody = (await malformedPatch.json()) as { code: string; details?: { message?: string } };
    assert.equal(malformedPatchBody.code, "INVALID_PAYLOAD");
    assert.equal(malformedPatchBody.details?.message, "Request body must be valid JSON.");

    const unauthenticatedPatch = await fetch(`${running.baseUrl}/api/personalization`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ themePresetId: "Cyber Grid" }),
    });
    assert.equal(unauthenticatedPatch.status, 401);
  } finally {
    await running.close();
  }
});

test("auth payload normalizes unsafe saved theme preset IDs", async () => {
  const { toUserPayload } = await import("../src/modules/auth/auth.routes.ts");
  const payload = toUserPayload({
    id: "user-invalid-theme",
    username: "listener",
    email: "listener@example.test",
    recommendationDataSharingEnabled: false,
    recommendationMode: "balanced",
    repeatedArtistTolerance: "normal",
    energyPreference: "mixed",
    themePresetId: "Made Up Preset",
    createdAt: "2026-05-19T00:00:00.000Z",
    role: "user",
  });

  assert.equal(payload.themePresetId, null);
});
