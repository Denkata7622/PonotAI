import test from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers/testHarness.ts";

test("/api/auth/me route is mounted and returns auth error instead of 404", async () => {
  const running = await startTestServer();
  try {
    const { baseUrl } = running;
    const response = await fetch(`${baseUrl}/api/auth/me`);
    assert.notEqual(response.status, 404);
    assert.equal(response.status, 401);
  } finally {
    await running.close();
  }
});
