import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { handleDownloadPost, type YtdlpRunner } from "../app/api/download/route";

test("400 when body empty", async () => {
  const req = new Request("http://localhost/api/download", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
  const res = await handleDownloadPost(req);
  assert.equal(res.status, 400);
});


test("400 when JSON is invalid", async () => {
  const req = new Request("http://localhost/api/download", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" });
  const res = await handleDownloadPost(req);
  assert.equal(res.status, 400);
  const payload = await res.json() as { error?: string };
  assert.equal(payload.error, "Invalid JSON body");
});

test("400 when youtubeId invalid", async () => {
  const req = new Request("http://localhost/api/download", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ youtubeId: "import-0" }) });
  const res = await handleDownloadPost(req);
  assert.equal(res.status, 400);
});

const fakeMp3 = Buffer.from([0x49, 0x44, 0x33, 0x04]);
const fakeRunner: YtdlpRunner = async (args, options) => {
  const outIndex = args.indexOf("-o");
  assert.ok(outIndex >= 0);
  const template = args[outIndex + 1];
  const outPath = template.replace("%(title).200B", "Test Song").replace("%(ext)s", "mp3");
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, fakeMp3);
  assert.equal(options.cwd.length > 0, true);
  return { code: 0, stdout: "", stderr: "" };
};

test("200 returns mp3 in youtubeId mode", async () => {
  const req = new Request("http://localhost/api/download", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ youtubeId: "abc123xyz_1" }) });
  const runner: YtdlpRunner = async (args, options) => {
    assert.ok(args.includes("https://www.youtube.com/watch?v=abc123xyz_1"));
    return fakeRunner(args, options);
  };
  const res = await handleDownloadPost(req, runner);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Content-Type"), "audio/mpeg");
  assert.match(res.headers.get("Content-Disposition") || "", /Test Song\.mp3/);
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), fakeMp3);
});

test("200 returns mp3 in query mode", async () => {
  const req = new Request("http://localhost/api/download", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: "artist title" }) });
  const runner: YtdlpRunner = async (args, options) => {
    assert.ok(args.includes("ytsearch1:artist title"));
    return fakeRunner(args, options);
  };
  const res = await handleDownloadPost(req, runner);
  assert.equal(res.status, 200);
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), fakeMp3);
});
