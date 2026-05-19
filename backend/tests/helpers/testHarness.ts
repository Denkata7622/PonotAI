import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export type RunningTestServer = {
  baseUrl: string;
  persistenceMode: "postgres" | "file-legacy";
  close: () => Promise<void>;
};

type StartTestServerOptions = {
  persistenceMode?: "postgres" | "file-legacy";
  allowUnavailablePostgresForHealthProbe?: boolean;
};

function resolveTestPersistenceMode(override?: "postgres" | "file-legacy"): "postgres" | "file-legacy" {
  if (override) return override;
  if (process.env.TEST_PERSISTENCE_MODE === "postgres") return "postgres";
  if (process.env.TEST_PERSISTENCE_MODE === "file-legacy") return "file-legacy";
  if (process.env.TEST_DATABASE_URL?.trim()) return "postgres";
  return process.env.DATABASE_URL ? "postgres" : "file-legacy";
}

export async function startTestServer(options: StartTestServerOptions = {}): Promise<RunningTestServer> {
  const tempDataDir = await mkdtemp(path.join(os.tmpdir(), "ponotai-tests-"));
  const previousEnv = {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    TEST_DATABASE_URL: process.env.TEST_DATABASE_URL,
    TEST_PERSISTENCE_MODE: process.env.TEST_PERSISTENCE_MODE,
    PERSISTENCE_MODE: process.env.PERSISTENCE_MODE,
    PONOTAI_DATA_DIR: process.env.PONOTAI_DATA_DIR,
    JWT_SECRET: process.env.JWT_SECRET,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    SHAZAM_MOCK_RESPONSE: process.env.SHAZAM_MOCK_RESPONSE,
    AUTH_BYPASS_EMAIL_VERIFICATION: process.env.AUTH_BYPASS_EMAIL_VERIFICATION,
  };
  const persistenceMode = resolveTestPersistenceMode(options.persistenceMode);
  const testDatabaseUrl = options.allowUnavailablePostgresForHealthProbe
    ? undefined
    : process.env.TEST_DATABASE_URL?.trim();

  process.env.NODE_ENV = "test";
  if (testDatabaseUrl) {
    process.env.DATABASE_URL = testDatabaseUrl;
  }
  process.env.JWT_SECRET = "test-secret";
  process.env.PONOTAI_DATA_DIR = tempDataDir;
  process.env.PERSISTENCE_MODE = persistenceMode;
  if (options.allowUnavailablePostgresForHealthProbe) {
    process.env.TEST_DATABASE_URL = " ";
    process.env.TEST_PERSISTENCE_MODE = " ";
  }
  process.env.AUTH_BYPASS_EMAIL_VERIFICATION = process.env.AUTH_BYPASS_EMAIL_VERIFICATION || "true";
  process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
  process.env.SHAZAM_MOCK_RESPONSE = process.env.SHAZAM_MOCK_RESPONSE ?? "";

  if (persistenceMode === "postgres") {
    if (!testDatabaseUrl) {
      if (!options.allowUnavailablePostgresForHealthProbe) {
        throw new Error("TEST_DATABASE_URL is required for PostgreSQL-backed backend tests. Refusing to use DATABASE_URL in NODE_ENV=test.");
      }
    } else {
      const { resetPostgresTestDatabase } = await import("./postgresTestDb.ts");
      await resetPostgresTestDatabase(testDatabaseUrl);
    }
  }

  const { validateEnvironment } = await import("../../src/config/env.ts");
  validateEnvironment();
  const { default: app } = await import("../../src/app.ts");
  const server = await new Promise<Server>((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    persistenceMode,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      await rm(tempDataDir, { recursive: true, force: true });
      for (const [key, value] of Object.entries(previousEnv)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    },
  };
}

export async function registerUser(baseUrl: string, prefix: string): Promise<{ token: string; userId: string }> {
  const unique = `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: unique.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 20),
      email: `${unique}@test.dev`,
      password: "password123",
    }),
  });

  if (response.status !== 201) {
    throw new Error(`register failed with ${response.status}`);
  }

  const body = (await response.json()) as { token: string; user: { id: string } };
  return { token: body.token, userId: body.user.id };
}
