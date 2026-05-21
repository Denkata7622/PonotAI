import test from "node:test";
import assert from "node:assert/strict";
import { startTestServer, registerUser } from "../helpers/testHarness.ts";

test("backend smoke: startup and core flows by persistence mode", async () => {
  const running = await startTestServer();

  try {
    const healthResponse = await fetch(`${running.baseUrl}/health`);
    assert.equal(healthResponse.status, 200);

    const apiHealthResponse = await fetch(`${running.baseUrl}/api/health`);
    assert.equal(apiHealthResponse.status, 200);
    const apiHealthBody = (await apiHealthResponse.json()) as {
      status: string;
      persistence: { mode: "postgres" | "file-legacy"; status: string };
    };
    assert.equal(apiHealthBody.status, "ok");
    assert.equal(apiHealthBody.persistence.mode, running.persistenceMode);
    assert.equal(apiHealthBody.persistence.status, "ready");

    const recognitionValidationResponse = await fetch(`${running.baseUrl}/api/recognition/audio`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "standard" }),
    });
    assert.equal(recognitionValidationResponse.status, 400);
    const recognitionError = (await recognitionValidationResponse.json()) as { code: string };
    assert.equal(recognitionError.code, "AUDIO_FILE_REQUIRED");

    if (running.persistenceMode !== "postgres") {
      return;
    }

    const user = await registerUser(running.baseUrl, "smoke-user");

    const meResponse = await fetch(`${running.baseUrl}/api/auth/me`, {
      headers: { authorization: `Bearer ${user.token}` },
    });
    assert.equal(meResponse.status, 200);
    const meBody = (await meResponse.json()) as { user: { id: string; email: string } };
    assert.equal(meBody.user.id, user.userId);

    const sharingUserEmail = `sharing-${Date.now()}@test.dev`;
    const sharingUsername = `sharing${Date.now().toString().slice(-8)}`;
    const sharingPassword = "password123";
    const registerSharingResponse = await fetch(`${running.baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: sharingUsername, email: sharingUserEmail, password: sharingPassword }),
    });
    assert.equal(registerSharingResponse.status, 201);
    const sharingRegisterPayload = (await registerSharingResponse.json()) as {
      token: string;
      user: {
        recommendationDataSharingEnabled?: boolean;
        recommendationMode?: string;
        repeatedArtistTolerance?: string;
        energyPreference?: string;
      };
    };
    const sharingToken = sharingRegisterPayload.token;
    assert.equal(sharingRegisterPayload.user.recommendationDataSharingEnabled, false);
    assert.equal(sharingRegisterPayload.user.recommendationMode, "balanced");
    assert.equal(sharingRegisterPayload.user.repeatedArtistTolerance, "normal");
    assert.equal(sharingRegisterPayload.user.energyPreference, "mixed");

    const enableSharingResponse = await fetch(`${running.baseUrl}/api/auth/me`, {
      method: "PATCH",
      headers: { "content-type": "application/json", authorization: `Bearer ${sharingToken}` },
      body: JSON.stringify({
        recommendationDataSharingEnabled: true,
        recommendationMode: "mostly_discovery",
        repeatedArtistTolerance: "higher",
        energyPreference: "more_energetic",
      }),
    });
    assert.equal(enableSharingResponse.status, 200);
    const updatedSharingUser = (await enableSharingResponse.json()) as {
      recommendationDataSharingEnabled?: boolean;
      recommendationMode?: string;
      repeatedArtistTolerance?: string;
      energyPreference?: string;
    };
    assert.equal(updatedSharingUser.recommendationDataSharingEnabled, true);
    assert.equal(updatedSharingUser.recommendationMode, "mostly_discovery");
    assert.equal(updatedSharingUser.repeatedArtistTolerance, "higher");
    assert.equal(updatedSharingUser.energyPreference, "more_energetic");

    const sharingMeResponse = await fetch(`${running.baseUrl}/api/auth/me`, {
      headers: { authorization: `Bearer ${sharingToken}` },
    });
    assert.equal(sharingMeResponse.status, 200);
    const sharingMeBody = (await sharingMeResponse.json()) as {
      user: {
        recommendationDataSharingEnabled?: boolean;
        recommendationMode?: string;
        repeatedArtistTolerance?: string;
        energyPreference?: string;
      };
    };
    assert.equal(sharingMeBody.user.recommendationDataSharingEnabled, true);
    assert.equal(sharingMeBody.user.recommendationMode, "mostly_discovery");
    assert.equal(sharingMeBody.user.repeatedArtistTolerance, "higher");
    assert.equal(sharingMeBody.user.energyPreference, "more_energetic");

    const invalidPersonalizationResponse = await fetch(`${running.baseUrl}/api/personalization`, {
      method: "PATCH",
      headers: { "content-type": "application/json", authorization: `Bearer ${sharingToken}` },
      body: JSON.stringify({ themePresetId: "Made Up Preset" }),
    });
    assert.equal(invalidPersonalizationResponse.status, 422);

    const savePersonalizationResponse = await fetch(`${running.baseUrl}/api/personalization`, {
      method: "PATCH",
      headers: { "content-type": "application/json", authorization: `Bearer ${sharingToken}` },
      body: JSON.stringify({ themePresetId: "organic-signal" }),
    });
    assert.equal(savePersonalizationResponse.status, 200);
    const savedPersonalization = (await savePersonalizationResponse.json()) as {
      preferences: { themePresetId?: string | null };
      source: string;
    };
    assert.equal(savedPersonalization.preferences.themePresetId, "organic-signal");
    assert.equal(savedPersonalization.source, "database");

    const invalidPersonalizationAfterSaveResponse = await fetch(`${running.baseUrl}/api/personalization`, {
      method: "PATCH",
      headers: { "content-type": "application/json", authorization: `Bearer ${sharingToken}` },
      body: JSON.stringify({ themePresetId: "Made Up Preset" }),
    });
    assert.equal(invalidPersonalizationAfterSaveResponse.status, 422);

    const loadPersonalizationResponse = await fetch(`${running.baseUrl}/api/personalization`, {
      headers: { authorization: `Bearer ${sharingToken}` },
    });
    assert.equal(loadPersonalizationResponse.status, 200);
    const loadedPersonalization = (await loadPersonalizationResponse.json()) as {
      preferences: { themePresetId?: string | null };
    };
    assert.equal(loadedPersonalization.preferences.themePresetId, "organic-signal");

    const reloginResponse = await fetch(`${running.baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: sharingUserEmail, password: sharingPassword }),
    });
    assert.equal(reloginResponse.status, 200);
    const reloginBody = (await reloginResponse.json()) as {
      token: string;
      user: {
        recommendationDataSharingEnabled?: boolean;
        recommendationMode?: string;
        repeatedArtistTolerance?: string;
        energyPreference?: string;
        themePresetId?: string | null;
      };
    };
    assert.equal(reloginBody.user.recommendationDataSharingEnabled, true);
    assert.equal(reloginBody.user.recommendationMode, "mostly_discovery");
    assert.equal(reloginBody.user.repeatedArtistTolerance, "higher");
    assert.equal(reloginBody.user.energyPreference, "more_energetic");
    assert.equal(reloginBody.user.themePresetId, "organic-signal");

    const invalidLoginResponse = await fetch(`${running.baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: sharingUserEmail, password: "wrong-password" }),
    });
    assert.equal(invalidLoginResponse.status, 401);
    const invalidLoginBody = (await invalidLoginResponse.json()) as { code: string; message: string };
    assert.equal(invalidLoginBody.code, "INVALID_CREDENTIALS");
    assert.match(invalidLoginBody.message, /Invalid email or password/);

    const reloadedPersonalizationResponse = await fetch(`${running.baseUrl}/api/personalization`, {
      headers: { authorization: `Bearer ${reloginBody.token}` },
    });
    assert.equal(reloadedPersonalizationResponse.status, 200);
    const reloadedPersonalization = (await reloadedPersonalizationResponse.json()) as {
      preferences: { themePresetId?: string | null };
    };
    assert.equal(reloadedPersonalization.preferences.themePresetId, "organic-signal");

    const recommendationsResponse = await fetch(`${running.baseUrl}/api/personalization/recommendations?currentThemePresetId=organic-signal`, {
      headers: { authorization: `Bearer ${reloginBody.token}` },
    });
    assert.equal(recommendationsResponse.status, 200);
    const recommendationsBody = (await recommendationsResponse.json()) as {
      recommendations: Array<{ kind: string; presetId?: string }>;
    };
    assert.ok(recommendationsBody.recommendations.length > 0);
    for (const recommendation of recommendationsBody.recommendations) {
      if (recommendation.kind === "theme") {
        assert.ok(["stock-clean", "ai-minimal", "cyber-grid", "neon-circuit", "urban-poster", "velvet-script", "steel-console", "arcade-pulse", "noir-gothic", "organic-signal"].includes(recommendation.presetId ?? ""));
      }
    }

    const assistantResponse = await fetch(`${running.baseUrl}/api/assistant`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${user.token}` },
      body: JSON.stringify({ message: "recommend something", conversation: [] }),
    });
    assert.equal(assistantResponse.status, 503);
    const assistantBody = (await assistantResponse.json()) as { code: string };
    assert.equal(assistantBody.code, "AI_SERVICE_UNAVAILABLE");

    const createPlaylistResponse = await fetch(`${running.baseUrl}/api/playlists`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${user.token}` },
      body: JSON.stringify({ name: "Smoke Playlist" }),
    });
    assert.equal(createPlaylistResponse.status, 201);
    const playlist = (await createPlaylistResponse.json()) as { id: string };

    const addSongResponse = await fetch(`${running.baseUrl}/api/playlists/${playlist.id}/songs`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${user.token}` },
      body: JSON.stringify({ title: "Numb", artist: "Linkin Park" }),
    });
    assert.equal(addSongResponse.status, 200);

    const shareResponse = await fetch(`${running.baseUrl}/api/share/playlist/${playlist.id}`, {
      method: "POST",
      headers: { authorization: `Bearer ${user.token}` },
    });
    assert.equal(shareResponse.status, 201);
    const shareBody = (await shareResponse.json()) as { shareCode: string };

    const sharedReadResponse = await fetch(`${running.baseUrl}/api/share/${shareBody.shareCode}`);
    assert.equal(sharedReadResponse.status, 200);
    const sharedPayload = (await sharedReadResponse.json()) as { type: string; songs?: unknown[] };
    assert.equal(sharedPayload.type, "playlist");
    assert.ok(Array.isArray(sharedPayload.songs));

    const achievementsResponse = await fetch(`${running.baseUrl}/api/achievements`, {
      headers: { authorization: `Bearer ${user.token}` },
    });
    assert.equal(achievementsResponse.status, 200);
    const achievementsBody = (await achievementsResponse.json()) as { items: Array<{ key: string }> };
    assert.ok(achievementsBody.items.some((achievement) => achievement.key === "first_playlist"));

    const createApiKeyResponse = await fetch(`${running.baseUrl}/api/developer/keys`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${user.token}` },
      body: JSON.stringify({ label: "Smoke key" }),
    });
    assert.equal(createApiKeyResponse.status, 201);

    const adminProtectedResponse = await fetch(`${running.baseUrl}/api/admin/overview`, {
      headers: { authorization: `Bearer ${user.token}` },
    });
    assert.equal(adminProtectedResponse.status, 403);
  } finally {
    await running.close();
  }
});
