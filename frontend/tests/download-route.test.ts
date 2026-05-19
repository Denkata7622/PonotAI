process.env.YTDLP_CACHE_DISABLED = "true";

import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { handleDownloadPost, type YtdlpRunner } from "../app/api/download/route";

const fakeMp3 = Buffer.from([0x49, 0x44, 0x33, 0x04]);
const validId = "abc123xyz_1";

function request(body: unknown): Request {
  return new Request("http://test.local/api/download", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const okRunner: YtdlpRunner = async (args) => {
  const outputTemplate = args[args.indexOf("-o") + 1];
  const outPath = outputTemplate.replace("%(title).200B", "Test Song").replace("%(ext)s", "mp3");
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, fakeMp3);
  return { code: 0, stdout: "", stderr: "" };
};

test("invalid JSON returns invalid-json", async () => {
  const res = await handleDownloadPost(request("{"));
  assert.equal(res.status, 400);
  assert.equal((await res.json() as { code: string }).code, "invalid-json");
});

test("empty body returns missing-input", async () => {
  const res = await handleDownloadPost(request({}));
  const body = await res.json() as { code: string };
  assert.equal(res.status, 400);
  assert.equal(body.code, "missing-input");
});

test("invalid youtubeId import-0 returns invalid-youtube-id", async () => {
  const res = await handleDownloadPost(request({ youtubeId: "import-0" }));
  const body = await res.json() as { code: string };
  assert.equal(res.status, 400);
  assert.equal(body.code, "invalid-youtube-id");
});

test("valid youtubeId creates watch URL target", async () => {
  const runner: YtdlpRunner = async (args, options) => {
    assert.ok(args.includes(`https://www.youtube.com/watch?v=${validId}`));
    assert.equal(options.bin, process.env.YTDLP_PATH || "yt-dlp");
    return okRunner(args, options);
  };
  const res = await handleDownloadPost(request({ youtubeId: validId }), runner);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Content-Type"), "audio/mpeg");
  assert.equal(res.headers.get("X-PonotAI-Download-Target-Type"), "id");
});

test("query creates ytsearch target", async () => {
  const runner: YtdlpRunner = async (args, options) => {
    assert.ok(args.includes("ytsearch1:artist title"));
    return okRunner(args, options);
  };
  const res = await handleDownloadPost(request({ query: "artist title" }), runner);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("Content-Disposition") || "", /Test Song.mp3/);
});

test("youtubeUrl accepts youtube.com/watch URLs", async () => {
  const runner: YtdlpRunner = async (args, options) => {
    assert.ok(args.includes(`https://www.youtube.com/watch?v=${validId}`));
    return okRunner(args, options);
  };
  const res = await handleDownloadPost(request({ youtubeUrl: `https://www.youtube.com/watch?v=${validId}&feature=share` }), runner);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("X-PonotAI-Download-Target-Type"), "url");
});

test("youtubeUrl accepts youtu.be URLs", async () => {
  const runner: YtdlpRunner = async (args, options) => {
    assert.ok(args.includes(`https://www.youtube.com/watch?v=${validId}`));
    return okRunner(args, options);
  };
  const res = await handleDownloadPost(request({ youtubeUrl: `https://youtu.be/${validId}` }), runner);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("X-PonotAI-Download-Target-Type"), "url");
});

test("youtubeUrl rejects lookalike domains", async () => {
  const res = await handleDownloadPost(request({ youtubeUrl: `https://youtube.com.evil.com/watch?v=${validId}` }));
  const body = await res.json() as { code: string };
  assert.equal(res.status, 400);
  assert.equal(body.code, "invalid-youtube-url");
});

test("successful fake runner returns mp3 bytes and cache headers", async () => {
  const res = await handleDownloadPost(request({ youtubeId: validId }), okRunner);
  const body = Buffer.from(await res.arrayBuffer());
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Content-Type"), "audio/mpeg");
  assert.match(res.headers.get("Content-Disposition") || "", /attachment; filename="Test Song.mp3"/);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  assert.equal(res.headers.get("X-PonotAI-Download-Cache"), "miss");
  assert.equal(res.headers.get("X-PonotAI-Download-Target-Type"), "id");
  assert.deepEqual(body, fakeMp3);
});

test("missing binary simulation returns missing-binary", async () => {
  const runner: YtdlpRunner = async () => {
    throw new Error("spawn yt-dlp ENOENT");
  };
  const res = await handleDownloadPost(request({ query: "x" }), runner);
  const body = await res.json() as { code: string };
  assert.equal(res.status, 500);
  assert.equal(body.code, "missing-binary");
});

test("ffmpeg missing returns ffmpeg-missing", async () => {
  const runner: YtdlpRunner = async () => ({ code: 1, stdout: "", stderr: "ffmpeg not found" });
  const res = await handleDownloadPost(request({ query: "x" }), runner);
  const body = await res.json() as { code: string };
  assert.equal(res.status, 500);
  assert.equal(body.code, "ffmpeg-missing");
});

test("youtube blocked returns youtube-blocked with 429", async () => {
  const runner: YtdlpRunner = async () => ({ code: 1, stdout: "", stderr: "Sign in to confirm you're not a bot" });
  const res = await handleDownloadPost(request({ query: "x" }), runner);
  const body = await res.json() as { code: string; fix: string };
  assert.equal(res.status, 429);
  assert.equal(body.code, "youtube-blocked");
  assert.match(body.fix, /private network|direct audio files/);
});

test("timeout returns timeout with 504", async () => {
  const runner: YtdlpRunner = async () => ({ code: 124, stdout: "", stderr: "yt-dlp timed out after 180000ms" });
  const res = await handleDownloadPost(request({ query: "x" }), runner);
  const body = await res.json() as { code: string };
  assert.equal(res.status, 504);
  assert.equal(body.code, "timeout");
});

test("empty output returns empty-output", async () => {
  const runner: YtdlpRunner = async () => ({ code: 0, stdout: "", stderr: "" });
  const res = await handleDownloadPost(request({ query: "x" }), runner);
  const body = await res.json() as { code: string };
  assert.equal(res.status, 502);
  assert.equal(body.code, "empty-output");
});

test("classification uses full stderr, not only first line", async () => {
  const runner: YtdlpRunner = async () => ({
    code: 1,
    stdout: "",
    stderr: "ERROR: unable to download video\nSign in to confirm you're not a bot\nHTTP Error 429",
  });
  const res = await handleDownloadPost(request({ query: "x" }), runner);
  const body = await res.json() as { code: string };
  assert.equal(res.status, 429);
  assert.equal(body.code, "youtube-blocked");
});
