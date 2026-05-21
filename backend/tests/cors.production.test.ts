import test from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers/testHarness.ts";

const FRONTEND_ORIGIN = "https://trackly-production.up.railway.app";
const PONOTAI_FRONTEND_ORIGIN = "https://ponotai-production.up.railway.app";

function withFrontendOrigin() {
  const previous = process.env.ALLOWED_ORIGINS;
  process.env.ALLOWED_ORIGINS = FRONTEND_ORIGIN;
  return () => {
    if (previous === undefined) delete process.env.ALLOWED_ORIGINS;
    else process.env.ALLOWED_ORIGINS = previous;
  };
}

function withPonotaiFrontendOrigin() {
  const previous = process.env.ALLOWED_ORIGINS;
  process.env.ALLOWED_ORIGINS = PONOTAI_FRONTEND_ORIGIN;
  return () => {
    if (previous === undefined) delete process.env.ALLOWED_ORIGINS;
    else process.env.ALLOWED_ORIGINS = previous;
  };
}

test("CORS preflight returns allow-origin for /api/history", async () => {
  const restore = withFrontendOrigin();
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
    restore();
  }
});

test("CORS preflight allows production PonotAI frontend origin", async () => {
  const restore = withPonotaiFrontendOrigin();
  const running = await startTestServer();
  try {
    const response = await fetch(`${running.baseUrl}/api/health`, {
      method: "OPTIONS",
      headers: {
        Origin: PONOTAI_FRONTEND_ORIGIN,
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "authorization,content-type",
      },
    });

    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), PONOTAI_FRONTEND_ORIGIN);
  } finally {
    await running.close();
    restore();
  }
});

test("CORS resolver includes Railway frontend and loopback origins", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousAllowed = process.env.ALLOWED_ORIGINS;
  try {
    process.env.NODE_ENV = "production";
    delete process.env.ALLOWED_ORIGINS;
    const { resolveAllowedOrigins } = await import("../src/config/cors.ts");
    const origins = resolveAllowedOrigins();
    assert.ok(origins.includes(PONOTAI_FRONTEND_ORIGIN));
    process.env.NODE_ENV = "development";
    assert.ok(resolveAllowedOrigins().includes("http://localhost:3000"));
    assert.ok(resolveAllowedOrigins().includes("http://127.0.0.1:3000"));
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousAllowed === undefined) delete process.env.ALLOWED_ORIGINS;
    else process.env.ALLOWED_ORIGINS = previousAllowed;
  }
});

test("env helper detects Railway interpolation placeholders", async () => {
  const { isRailwayInterpolationSyntax } = await import("../src/config/env.ts");
  assert.equal(isRailwayInterpolationSyntax("${{Postgres.DATABASE_URL}}"), true);
  assert.equal(isRailwayInterpolationSyntax("postgresql://localhost:5432/trackly"), false);
});

test("CORS preflight returns allow-origin for /api/recognition/image", async () => {
  const restore = withFrontendOrigin();
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
    restore();
  }
});

test("CORS preflight allows assistant custom headers", async () => {
  const restore = withFrontendOrigin();
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
    restore();
  }
});

test("CORS preflight allows x-api-key for developer API routes", async () => {
  const restore = withFrontendOrigin();
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
    restore();
  }
});
