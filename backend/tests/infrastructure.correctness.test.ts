import test from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers/testHarness.ts";

test("persistence mode resolves from current env instead of import-time snapshot", async () => {
  const persistenceModule = await import("../src/db/persistence.ts");
  const previous = process.env.DATABASE_URL;

  try {
    delete process.env.DATABASE_URL;
    assert.equal(persistenceModule.getPersistenceMode(), "file");

    process.env.DATABASE_URL = "postgresql://localhost:5432/trackly";
    assert.equal(persistenceModule.getPersistenceMode(), "database_url");
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

test("/api/health reflects real disconnected DB status when DATABASE_URL is unreachable", async () => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "postgresql://127.0.0.1:1/trackly";

  const running = await startTestServer();

  try {
    const response = await fetch(`${running.baseUrl}/api/health`);
    assert.equal(response.status, 503);
    const payload = (await response.json()) as { db: string; status: string; mode: string };
    assert.equal(payload.db, "disconnected");
    assert.equal(payload.status, "partial");
    assert.equal(payload.mode, "database_url");
  } finally {
    await running.close();
    if (previousDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }
  }
});
