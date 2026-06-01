import test from "node:test";
import assert from "node:assert/strict";
import { POST } from "../app/api/download/process/route";

const fakeMp3 = new Uint8Array([0x49, 0x44, 0x33, 0x04]);

function decodeHeader(value: string | null): Record<string, any> {
  assert.ok(value);
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<string, any>;
}

test("direct audio process route returns audio and safe post-processing metadata", async () => {
  const form = new FormData();
  form.set("audio", new File([fakeMp3], "raw song.mp3", { type: "audio/mpeg" }));
  form.set("metadata", JSON.stringify({
    title: "Thunderstruck",
    artist: "AC/DC",
    raw: { coverUrl: "https://img.example.test/cover.jpg" },
  }));
  form.set("postProcessing", JSON.stringify({ cleanMetadata: true, embedCover: true, normalizeLoudness: false }));

  const res = await POST(new Request("http://test.local/api/download/process", { method: "POST", body: form }));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Content-Type"), "audio/mpeg");
  assert.deepEqual(Array.from(new Uint8Array(await res.arrayBuffer())), Array.from(fakeMp3));
  const header = decodeHeader(res.headers.get("X-PonotAI-Postprocessing"));
  assert.equal(header.metadata.title, "Thunderstruck");
  assert.equal(header.metadata.artist, "AC/DC");
  assert.doesNotMatch(JSON.stringify(header), /img\.example\.test|token|secret|password|cookie/i);
});

test("direct audio process route rejects missing audio", async () => {
  const res = await POST(new Request("http://test.local/api/download/process", { method: "POST", body: new FormData() }));
  assert.equal(res.status, 400);
  assert.equal((await res.json() as { code: string }).code, "missing-audio");
});

test("direct audio process route rejects arbitrary audio filters", async () => {
  const form = new FormData();
  form.set("audio", new File([fakeMp3], "raw song.mp3", { type: "audio/mpeg" }));
  form.set("metadata", JSON.stringify({ title: "Title", artist: "Artist" }));
  form.set("postProcessing", JSON.stringify({ audioPolish: { mode: "normalize-loudness", ffmpegArgs: ["-af", "bass=g=6"] } }));

  const res = await POST(new Request("http://test.local/api/download/process", { method: "POST", body: form }));
  assert.equal(res.status, 400);
  assert.equal((await res.json() as { code: string }).code, "invalid-audio-polish-options");
});
