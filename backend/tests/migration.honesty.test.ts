import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

function runMigration(args: string[], dataDir: string) {
  return spawnSync("npx", ["tsx", "scripts/migrate-json-to-postgres.ts", ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: "postgresql://127.0.0.1:1/trackly",
      PONOTAI_DATA_DIR: dataDir,
    },
    encoding: "utf8",
  });
}

test("json migration dry-run is truthful and execute mode attempts database writes", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "ponotai-migration-"));
  await writeFile(path.join(dataDir, "appdb.json"), JSON.stringify({ users: [{ id: "u1", username: "u", email: "u@test.dev", passwordHash: "h" }] }));
  await writeFile(path.join(dataDir, "history.json"), JSON.stringify([{ id: "h1", songName: "Numb", artist: "Linkin Park" }]));

  const dryRun = runMigration(["--dry-run"], dataDir);
  assert.equal(dryRun.status, 0);
  assert.match(dryRun.stdout + dryRun.stderr, /mode=dry-run/);
  assert.match(dryRun.stdout + dryRun.stderr, /dry-run summary/);

  const execute = runMigration(["--execute"], dataDir);
  assert.notEqual(execute.status, 0);
  assert.match(execute.stdout + execute.stderr, /mode=execute/);
});
