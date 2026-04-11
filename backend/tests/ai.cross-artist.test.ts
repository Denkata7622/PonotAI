import test from "node:test";
import assert from "node:assert/strict";
import { startTestServer, registerUser } from "./helpers/testHarness.ts";
import { __setExternalDiscoveryClientForTests } from "../src/services/assistant/externalDiscovery.ts";
import { parseActionIntent } from "../src/services/assistant/actionParser.ts";

async function seedHistory(baseUrl: string, token: string, title: string, artist: string): Promise<void> {
  const response = await fetch(`${baseUrl}/api/history`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ method: "audio-file", title, artist, recognized: true }),
  });
  assert.equal(response.status, 201);
}

test("cross-artist recommendations exclude heavily present library artists", async () => {
  __setExternalDiscoveryClientForTests({
    findSimilarArtistsByArtist: async () => [
      { artist: "Known Artist", source: "deezer", similarityScore: 0.9, sampleTracks: [{ title: "K1", artist: "Known Artist" }] },
      { artist: "New Artist", source: "deezer", similarityScore: 0.88, sampleTracks: [{ title: "N1", artist: "New Artist" }] },
    ],
    findArtistsByGenre: async () => [],
  });

  const running = await startTestServer();
  try {
    const user = await registerUser(running.baseUrl, "cross-artist");
    await seedHistory(running.baseUrl, user.token, "Song 1", "Known Artist");
    await seedHistory(running.baseUrl, user.token, "Song 2", "Known Artist");

    const response = await fetch(`${running.baseUrl}/api/ai/recommendations/cross-artist?differentArtistsOnly=true&limit=5`, {
      headers: { authorization: `Bearer ${user.token}` },
    });
    assert.equal(response.status, 200);
    const body = await response.json() as { recommendations: Array<{ artist: string }> };
    assert.ok(body.recommendations.length > 0);
    assert.equal(body.recommendations.some((item) => item.artist === "Known Artist"), false);
    assert.equal(body.recommendations.some((item) => item.artist === "New Artist"), true);
  } finally {
    __setExternalDiscoveryClientForTests(null);
    await running.close();
  }
});

test("cross-artist recommendations gracefully handle tiny libraries", async () => {
  __setExternalDiscoveryClientForTests({
    findSimilarArtistsByArtist: async () => [],
    findArtistsByGenre: async () => [],
  });

  const running = await startTestServer();
  try {
    const user = await registerUser(running.baseUrl, "tiny-library");
    await seedHistory(running.baseUrl, user.token, "Only Song", "Only Artist");

    const response = await fetch(`${running.baseUrl}/api/ai/recommendations/cross-artist?differentArtistsOnly=true&limit=5`, {
      headers: { authorization: `Bearer ${user.token}` },
    });
    assert.equal(response.status, 200);
    const body = await response.json() as { recommendations: Array<{ artist: string }>; message: string };
    assert.ok(body.recommendations.length > 0);
    assert.match(body.message, /discovery/i);
  } finally {
    __setExternalDiscoveryClientForTests(null);
    await running.close();
  }
});

test("cross-artist recommendations degrade safely when external discovery fails", async () => {
  __setExternalDiscoveryClientForTests({
    findSimilarArtistsByArtist: async () => {
      throw new Error("external down");
    },
    findArtistsByGenre: async () => [],
  });

  const running = await startTestServer();
  try {
    const user = await registerUser(running.baseUrl, "external-fail");
    await seedHistory(running.baseUrl, user.token, "Anchor Song", "Anchor Artist");

    const response = await fetch(`${running.baseUrl}/api/ai/recommendations/cross-artist?differentArtistsOnly=true&limit=5`, {
      headers: { authorization: `Bearer ${user.token}` },
    });
    assert.equal(response.status, 200);
    const body = await response.json() as { externalAvailable: boolean; message: string };
    assert.equal(body.externalAvailable, false);
    assert.match(body.message, /temporarily unavailable/i);
  } finally {
    __setExternalDiscoveryClientForTests(null);
    await running.close();
  }
});

test("assistant action parser recognizes cross-artist discovery intents", () => {
  const parsed = parseActionIntent(`Suggestions ready.\n<action>{"type":"CROSS_ARTIST_DISCOVERY","confidence":0.82,"payload":{"differentArtistsOnly":true,"limit":8},"requiresConfirmation":true,"reason":"Find similar but new artists"}</action>`);
  assert.equal(parsed.parseError, false);
  assert.equal(parsed.actionIntent?.type, "CROSS_ARTIST_DISCOVERY");

  const search = parseActionIntent(`<action>{"type":"SEARCH_ARTIST","confidence":0.7,"payload":{"artist":"Dirty Honey"},"requiresConfirmation":true}</action>`);
  assert.equal(search.parseError, false);
  assert.equal(search.actionIntent?.type, "SEARCH_ARTIST");
});
