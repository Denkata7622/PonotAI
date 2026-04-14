import test from "node:test";
import assert from "node:assert/strict";
import { startTestServer, registerUser } from "./helpers/testHarness.ts";

test("library sync merge mode stays stable across duplicate assistant-triggered submits", async () => {
  const running = await startTestServer();
  try {
    const user = await registerUser(running.baseUrl, "library-sync-idempotent");
    const payload = {
      mode: "merge",
      source: "assistant",
      playlists: [
        {
          id: "assistant-pl-1",
          name: "Assistant Playlist",
          songs: [
            { title: "Song A", artist: "Artist A" },
          ],
        },
      ],
    };

    const submit = () =>
      fetch(`${running.baseUrl}/api/library/sync`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${user.token}` },
        body: JSON.stringify(payload),
      });

    const [first, second] = await Promise.all([submit(), submit()]);
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);

    const library = await fetch(`${running.baseUrl}/api/library`, {
      headers: { authorization: `Bearer ${user.token}` },
    });
    assert.equal(library.status, 200);
    const body = (await library.json()) as { playlists: Array<{ id: string; name: string }> };
    assert.equal(body.playlists.length, 1);
    assert.equal(body.playlists[0].id, "assistant-pl-1");
  } finally {
    await running.close();
  }
});
