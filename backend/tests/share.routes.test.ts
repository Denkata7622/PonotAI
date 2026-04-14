import test from "node:test";
import assert from "node:assert/strict";
import { startTestServer, registerUser } from "./helpers/testHarness.ts";

test("POST /api/share/song remains a compatibility alias of POST /api/share", async () => {
  const running = await startTestServer();
  try {
    const user = await registerUser(running.baseUrl, "share-alias");

    const createViaCanonical = await fetch(`${running.baseUrl}/api/share`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${user.token}`,
      },
      body: JSON.stringify({ title: "Song A", artist: "Artist A" }),
    });

    const canonicalBody = (await createViaCanonical.json()) as { type: string; shareCode: string };
    assert.equal(createViaCanonical.status, 201);
    assert.equal(canonicalBody.type, "song");
    assert.equal(typeof canonicalBody.shareCode, "string");

    const createViaAlias = await fetch(`${running.baseUrl}/api/share/song`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${user.token}`,
      },
      body: JSON.stringify({ title: "Song B", artist: "Artist B" }),
    });

    const aliasBody = (await createViaAlias.json()) as { type: string; shareCode: string };
    assert.equal(createViaAlias.status, 201);
    assert.equal(aliasBody.type, "song");
    assert.equal(typeof aliasBody.shareCode, "string");
  } finally {
    await running.close();
  }
});
