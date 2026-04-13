import test from "node:test";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { startTestServer } from "./helpers/testHarness.ts";
import {
  getDemoSongsDatasetPathCandidates,
  listDemoPersonas,
  resetDemoSongsDatasetCacheForTests,
} from "../src/modules/demo/demo.service.ts";

const execFileAsync = promisify(execFile);

async function register(baseUrl: string, username: string, email: string) {
  return fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, email, password: "password123" }),
  });
}

test("demo dataset path candidates include both src and dist runtime locations", () => {
  const candidates = getDemoSongsDatasetPathCandidates({
    cwd: "/app/backend",
    moduleDir: "/app/backend/dist/modules/demo",
    overridePaths: "",
  });

  assert.deepEqual(candidates, [
    "/app/backend/dist/data/demoSongs.json",
    "/app/backend/src/data/demoSongs.json",
    "/app/backend/src/data/demoSongs.json",
    "/app/backend/dist/data/demoSongs.json",
  ]);
});

test("missing dataset does not break demo module usage that does not generate accounts", () => {
  process.env.DEMO_SONGS_DATASET_PATHS = "/tmp/trackly-does-not-exist-demoSongs.json";
  resetDemoSongsDatasetCacheForTests();

  const personas = listDemoPersonas();
  assert.ok(personas.length > 0);

  delete process.env.DEMO_SONGS_DATASET_PATHS;
  resetDemoSongsDatasetCacheForTests();
});

test("admin demo generation returns structured error when dataset is unavailable", async () => {
  process.env.ADMIN_EMAIL = "admin@trackly.test";
  process.env.DEMO_SONGS_DATASET_PATHS = "/tmp/trackly-missing-demoSongs.json";
  resetDemoSongsDatasetCacheForTests();

  const running = await startTestServer();

  try {
    const registerResponse = await register(running.baseUrl, "trackly_admin2", "admin@trackly.test");
    assert.equal(registerResponse.status, 201);
    const registerBody = (await registerResponse.json()) as { token: string };

    const demoResponse = await fetch(`${running.baseUrl}/api/admin/demo-account`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${registerBody.token}` },
      body: JSON.stringify({ persona: "gym", confirmGeneration: true }),
    });

    assert.equal(demoResponse.status, 503);
    assert.deepEqual(await demoResponse.json(), {
      code: "DEMO_DATA_UNAVAILABLE",
      message: "Demo song dataset is unavailable on the server.",
    });
  } finally {
    await running.close();
    delete process.env.ADMIN_EMAIL;
    delete process.env.DEMO_SONGS_DATASET_PATHS;
    resetDemoSongsDatasetCacheForTests();
  }
});

test("copy-runtime-assets script places demoSongs dataset in dist/data", async () => {
  const backendRoot = path.join(process.cwd());
  await execFileAsync("node", ["./scripts/copy-runtime-assets.mjs"], { cwd: backendRoot });

  await access(path.join(backendRoot, "dist", "data", "demoSongs.json"));
});
