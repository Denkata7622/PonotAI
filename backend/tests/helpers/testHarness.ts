import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export type RunningTestServer = {
  baseUrl: string;
  close: () => Promise<void>;
};

export async function startTestServer(): Promise<RunningTestServer> {
  const tempDataDir = await mkdtemp(path.join(os.tmpdir(), "ponotai-tests-"));
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "test-secret";
  process.env.PONOTAI_DATA_DIR = tempDataDir;
  process.env.GEMINI_API_KEY = "";
  process.env.SHAZAM_MOCK_RESPONSE = "";

  const { default: app } = await import("../../src/app.ts");
  const server = await new Promise<Server>((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      await rm(tempDataDir, { recursive: true, force: true });
      delete process.env.PONOTAI_DATA_DIR;
      delete process.env.GEMINI_API_KEY;
      delete process.env.SHAZAM_MOCK_RESPONSE;
      delete process.env.JWT_SECRET;
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
