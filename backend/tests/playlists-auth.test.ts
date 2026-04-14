import test from "node:test";
import assert from "node:assert/strict";
import { startTestServer, registerUser } from "./helpers/testHarness.ts";

test("playlist ownership and authorization boundaries", async () => {
  const running = await startTestServer();

  try {
    const userA = await registerUser(running.baseUrl, "playlista");
    const userB = await registerUser(running.baseUrl, "playlistb");

    const createRes = await fetch(`${running.baseUrl}/api/playlists`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${userA.token}` },
      body: JSON.stringify({ name: "Private Mix" }),
    });
    assert.equal(createRes.status, 201);
    const created = (await createRes.json()) as { id: string };

    const readByB = await fetch(`${running.baseUrl}/api/playlists/${created.id}`, {
      headers: { authorization: `Bearer ${userB.token}` },
    });
    assert.equal(readByB.status, 404);

    const editByB = await fetch(`${running.baseUrl}/api/playlists/${created.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", authorization: `Bearer ${userB.token}` },
      body: JSON.stringify({ name: "Hacked" }),
    });
    assert.equal(editByB.status, 404);

    const deleteByB = await fetch(`${running.baseUrl}/api/playlists/${created.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${userB.token}` },
    });
    assert.equal(deleteByB.status, 404);

    const unauthorizedChecks = await Promise.all([
      fetch(`${running.baseUrl}/api/playlists`),
      fetch(`${running.baseUrl}/api/playlists`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "x" }) }),
      fetch(`${running.baseUrl}/api/playlists/${created.id}`),
      fetch(`${running.baseUrl}/api/playlists/${created.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "x" }) }),
      fetch(`${running.baseUrl}/api/playlists/${created.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "x" }) }),
      fetch(`${running.baseUrl}/api/playlists/${created.id}`, { method: "DELETE" }),
      fetch(`${running.baseUrl}/api/playlists/${created.id}/songs`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "a", artist: "b" }) }),
    ]);

    assert.ok(unauthorizedChecks.every((response) => response.status === 401));
  } finally {
    await running.close();
  }
});
