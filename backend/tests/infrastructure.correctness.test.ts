import test from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers/testHarness.ts";

test("persistence mode remains file-backed even when DATABASE_URL is configured", async () => {
  const persistenceModule = await import("../src/db/persistence.ts");
  const previous = process.env.DATABASE_URL;

  try {
    delete process.env.DATABASE_URL;
    assert.equal(persistenceModule.getPersistenceMode(), "file");

    process.env.DATABASE_URL = "postgresql://localhost:5432/trackly";
    assert.equal(persistenceModule.getPersistenceMode(), "file");
  } finally {
    if (previous === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previous;
    }
  }
});

test("CORS origins resolve from runtime env", async () => {
  const previous = process.env.ALLOWED_ORIGINS;

  try {
    process.env.ALLOWED_ORIGINS = "https://runtime-trackly.example";
    const { getCorsOptions } = await import("../src/config/cors.ts");
    const cors = getCorsOptions();

    const allowed = await new Promise<boolean>((resolve, reject) => {
      if (typeof cors.origin !== "function") {
        reject(new Error("origin function missing"));
        return;
      }
      cors.origin("https://runtime-trackly.example", (error, allow) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(Boolean(allow));
      });
    });

    assert.equal(allowed, true);
  } finally {
    if (previous === undefined) {
      delete process.env.ALLOWED_ORIGINS;
    } else {
      process.env.ALLOWED_ORIGINS = previous;
    }
  }
});

test("production CORS excludes localhost defaults unless explicitly configured", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousAllowed = process.env.ALLOWED_ORIGINS;
  const previousCors = process.env.CORS_ORIGINS;
  const previousFrontend = process.env.FRONTEND_URL;
  const previousFrontends = process.env.FRONTEND_URLS;

  try {
    process.env.NODE_ENV = "production";
    delete process.env.ALLOWED_ORIGINS;
    delete process.env.CORS_ORIGINS;
    delete process.env.FRONTEND_URL;
    delete process.env.FRONTEND_URLS;
    const { getCorsOptions } = await import("../src/config/cors.ts");
    const cors = getCorsOptions();
    const allowLocalhost = await new Promise<boolean>((resolve, reject) => {
      if (typeof cors.origin !== "function") {
        reject(new Error("origin function missing"));
        return;
      }
      cors.origin("http://localhost:3000", (error, allow) => {
        if (error) return reject(error);
        resolve(Boolean(allow));
      });
    });
    assert.equal(allowLocalhost, false);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousAllowed === undefined) delete process.env.ALLOWED_ORIGINS;
    else process.env.ALLOWED_ORIGINS = previousAllowed;
    if (previousCors === undefined) delete process.env.CORS_ORIGINS;
    else process.env.CORS_ORIGINS = previousCors;
    if (previousFrontend === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = previousFrontend;
    if (previousFrontends === undefined) delete process.env.FRONTEND_URLS;
    else process.env.FRONTEND_URLS = previousFrontends;
  }
});

test("/api/health reports file-backed persistence even when DATABASE_URL is unreachable", async () => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "postgresql://127.0.0.1:1/trackly";

  const running = await startTestServer();

  try {
    const response = await fetch(`${running.baseUrl}/api/health`);
    assert.equal(response.status, 200);
    const payload = (await response.json()) as { db: string; status: string; mode: string };
    assert.equal(payload.db, "connected");
    assert.equal(payload.status, "ok");
    assert.equal(payload.mode, "file");
  } finally {
    await running.close();
    if (previousDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }
  }
});
