import test from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers/testHarness.ts";

const FRONTEND_ORIGIN = "https://trackly-production.up.railway.app";

test("CORS preflight returns allow-origin for /api/history", async () => {
  const running = await startTestServer();
  try {
    const response = await fetch(`${running.baseUrl}/api/history?limit=18`, {
      method: "OPTIONS",
      headers: {
        Origin: FRONTEND_ORIGIN,
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "authorization,content-type,x-recognition-attempt-id",
      },
    });

    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), FRONTEND_ORIGIN);
  } finally {
    await running.close();
  }
});

test("CORS preflight returns allow-origin for /api/recognition/image", async () => {
  const running = await startTestServer();
  try {
    const response = await fetch(`${running.baseUrl}/api/recognition/image`, {
      method: "OPTIONS",
      headers: {
        Origin: FRONTEND_ORIGIN,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type,x-recognition-attempt-id",
      },
    });

    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), FRONTEND_ORIGIN);
  } finally {
    await running.close();
  }
});

test("CORS preflight allows assistant custom headers", async () => {
  const running = await startTestServer();
  try {
    const response = await fetch(`${running.baseUrl}/api/assistant`, {
      method: "OPTIONS",
      headers: {
        Origin: FRONTEND_ORIGIN,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type,x-trackly-queue,x-trackly-theme,x-trackly-language,x-trackly-preferences,x-trackly-device",
      },
    });

    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), FRONTEND_ORIGIN);
    const allowHeaders = response.headers.get("access-control-allow-headers") ?? "";
    assert.match(allowHeaders.toLowerCase(), /x-trackly-device/);
    assert.match(allowHeaders.toLowerCase(), /x-trackly-preferences/);
  } finally {
    await running.close();
  }
});

test("CORS preflight allows x-api-key for developer API routes", async () => {
  const running = await startTestServer();
  try {
    const response = await fetch(`${running.baseUrl}/api/developer/v1/recommendations`, {
      method: "OPTIONS",
      headers: {
        Origin: FRONTEND_ORIGIN,
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "x-api-key,content-type",
      },
    });

    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), FRONTEND_ORIGIN);
    const allowHeaders = response.headers.get("access-control-allow-headers") ?? "";
    assert.match(allowHeaders.toLowerCase(), /x-api-key/);
  } finally {
    await running.close();
  }
});
