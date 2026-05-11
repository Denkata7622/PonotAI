process.env.YTDLP_CACHE_DISABLED = "true";

import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { handleDownloadPost, type YtdlpRunner } from "../app/api/download/route";

const fakeMp3 = Buffer.from([0x49, 0x44, 0x33, 0x04]);
const okRunner: YtdlpRunner = async (args, options) => {
  const outPath = args[args.indexOf("-o") + 1].replace("%(title).200B", "Test Song").replace("%(ext)s", "mp3");
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, fakeMp3);
  return { code: 0, stdout: "", stderr: "" };
};

test("invalid json", async () => {
  const res = await handleDownloadPost(new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: "{" }));
  assert.equal(res.status, 400);
  assert.equal((await res.json() as any).code, "invalid-json");
});

test("empty body", async () => {
  const res = await handleDownloadPost(new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) }));
  assert.equal(res.status, 400);
});

test("invalid youtube id import-0", async () => {
  const res = await handleDownloadPost(new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ youtubeId: "import-0" }) }));
  assert.equal(res.status, 400);
});

test("valid youtube id target", async () => {
  const runner: YtdlpRunner = async (args, options) => { assert.ok(args.includes("https://www.youtube.com/watch?v=abc123xyz_1")); return okRunner(args, options); };
  const res = await handleDownloadPost(new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ youtubeId: "abc123xyz_1" }) }), runner);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Content-Type"), "audio/mpeg");
});

test("query target", async () => {
  const runner: YtdlpRunner = async (args, options) => { assert.ok(args.includes("ytsearch1:artist title")); return okRunner(args, options); };
  const res = await handleDownloadPost(new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: "artist title" }) }), runner);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("Content-Disposition") || "", /Test Song.mp3/);
});

test("missing binary", async () => {
  const runner: YtdlpRunner = async () => { throw new Error("spawn yt-dlp ENOENT"); };
  const res = await handleDownloadPost(new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: "x" }) }), runner);
  const body = await res.json() as any; assert.equal(body.code, "missing-binary");
});

test("ffmpeg missing", async () => {
  const runner: YtdlpRunner = async () => ({ code: 1, stdout: "", stderr: "ffmpeg not found" });
  const res = await handleDownloadPost(new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: "x" }) }), runner);
  assert.equal((await res.json() as any).code, "ffmpeg-missing");
});

test("youtube blocked", async () => {
  const runner: YtdlpRunner = async () => ({ code: 1, stdout: "", stderr: "Sign in to confirm you're not a bot" });
  const res = await handleDownloadPost(new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: "x" }) }), runner);
  assert.equal(res.status, 429);
});

test("timeout", async () => {
  const runner: YtdlpRunner = async () => ({ code: 124, stdout: "", stderr: "yt-dlp timed out after 180000ms" });
  const res = await handleDownloadPost(new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: "x" }) }), runner);
  assert.equal(res.status, 504);
});
