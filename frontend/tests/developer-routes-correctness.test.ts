import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { POST } from "../app/api/recognize/route";

test("legacy recognize API route is explicitly removed and never returns synthetic success", async () => {
  const response = await POST();
  assert.equal(response.status, 410);
  const payload = await response.json() as { code: string; message: string };
  assert.equal(payload.code, "LEGACY_RECOGNIZE_REMOVED");
  assert.match(payload.message, /Legacy \/api\/recognize is removed/);
});

test("developers page examples reference only existing backend developer endpoints", async () => {
  const testDir = path.dirname(fileURLToPath(import.meta.url));
  const filePath = path.resolve(testDir, "../app/developers/page.tsx");
  const content = await readFile(filePath, "utf8");

  assert.match(content, /\/api\/developer\/v1\/recognition\/audio/);
  assert.match(content, /\/api\/developer\/v1\/recommendations/);
  assert.doesNotMatch(content, /\/api\/developer\/v1\/recognition\/image/);
});
