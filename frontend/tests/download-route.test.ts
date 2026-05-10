import test from "node:test";
import assert from "node:assert/strict";
import { handleDownloadPost } from "../app/api/download/route";

test("download route returns 400 when youtubeId/query missing", async () => {
  const req = new Request("http://localhost:3000/api/download", { method: "POST", body: JSON.stringify({}), headers: { "Content-Type": "application/json" } });
  const res = await handleDownloadPost(req, async () => Buffer.alloc(0));
  assert.equal(res.status, 400);
});

test("download route returns 200 with audio/mpeg for youtubeId", async () => {
  let calls = 0;
  const runner = async () => {
    calls += 1;
    if (calls === 1) return { stdout: Buffer.from([0x49, 0x44, 0x33]) };
    return { stdout: Buffer.from("Test title") };
  };
  const req = new Request("http://localhost:3000/api/download", { method: "POST", body: JSON.stringify({ youtubeId: "abc123" }), headers: { "Content-Type": "application/json" } });
  const res = await handleDownloadPost(req, runner);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Content-Type"), "audio/mpeg");
  const body = new Uint8Array(await res.arrayBuffer());
  assert.equal(body[0], 0x49);
});
