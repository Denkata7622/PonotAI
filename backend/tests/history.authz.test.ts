import test from "node:test";
import assert from "node:assert/strict";
import { startTestServer, registerUser } from "./helpers/testHarness.ts";

test("POST /api/history rejects unauthenticated writes", async () => {
  const running = await startTestServer();
  try {
    const response = await fetch(`${running.baseUrl}/api/history`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        method: "audio-file",
        title: "Unauth Song",
        artist: "Anonymous",
        recognized: true,
      }),
    });

    assert.equal(response.status, 401);
  } finally {
    await running.close();
  }
});
