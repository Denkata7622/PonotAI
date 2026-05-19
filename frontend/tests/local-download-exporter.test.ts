import test from "node:test";
import assert from "node:assert/strict";
import {
  createLocalExportZip,
  type LocalExportSong,
} from "../lib/localDownloadExporter";

const audioBytes = new Uint8Array([0x49, 0x44, 0x33, 0x04]);

function audioResponse(): Response {
  return new Response(new Blob([audioBytes], { type: "audio/mpeg" }), {
    status: 200,
    headers: { "content-type": "audio/mpeg" },
  });
}

function jsonError(code: string, status: number): Response {
  return new Response(JSON.stringify({
    error: "YouTube download failed.",
    code,
    detail: `${code} detail`,
    fix: `${code} fix`,
  }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function listZipFiles(blob: Blob): Promise<Map<string, string>> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const files = new Map<string, string>();
  let offset = 0;

  while (offset + 30 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    const compressedSize = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    const name = decoder.decode(bytes.slice(nameStart, nameStart + nameLength));
    files.set(name, decoder.decode(bytes.slice(dataStart, dataEnd)));
    offset = dataEnd;
  }

  return files;
}

function fileEnding(files: Map<string, string>, ending: string): string | undefined {
  return Array.from(files.keys()).find((name) => name.endsWith(ending));
}

test("file and blob sources export without calling /api/download", async () => {
  let calls = 0;
  const fetcher = async (input: RequestInfo | URL) => {
    if (String(input) === "/api/download") calls += 1;
    throw new Error("unexpected fetch");
  };

  const songs: LocalExportSong[] = [
    { id: "file", title: "File Song", artist: "Artist", file: new File([audioBytes], "file.mp3", { type: "audio/mpeg" }) },
    { id: "blob", title: "Blob Song", artist: "Artist", blob: new Blob([audioBytes], { type: "audio/mpeg" }) },
  ];

  const result = await createLocalExportZip(songs, undefined, { fetcher });
  assert.equal(calls, 0);
  assert.equal(result.exportedCount, 2);
  assert.equal(result.failedCount, 0);
  assert.equal(result.skippedCount, 0);
});

test("direct mp3 URL fetches directly and does not use /api/download", async () => {
  const seen: string[] = [];
  const fetcher = async (input: RequestInfo | URL) => {
    const url = String(input);
    seen.push(url);
    if (url === "https://cdn.example.test/song.mp3") return audioResponse();
    throw new Error(`unexpected fetch ${url}`);
  };

  const result = await createLocalExportZip([
    { id: "direct", title: "Direct Song", artist: "Artist", audioUrl: "https://cdn.example.test/song.mp3" },
  ], undefined, { fetcher });

  assert.deepEqual(seen, ["https://cdn.example.test/song.mp3"]);
  assert.equal(result.exportedCount, 1);
});

test("YouTube page URL is not browser-fetched and invalid youtubeVideoId falls back to query", async () => {
  let apiCalls = 0;
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    assert.doesNotMatch(url, /youtube\.com|youtu\.be/);
    if (url === "/api/download") {
      apiCalls += 1;
      const body = JSON.parse(String(init?.body)) as { youtubeId?: string; query?: string };
      assert.equal(body.youtubeId, undefined);
      assert.equal(body.query, "Artist - Query Song");
      return audioResponse();
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  const result = await createLocalExportZip([
    {
      id: "yt-page",
      title: "Query Song",
      artist: "Artist",
      sourceUrl: "https://www.youtube.com/watch?v=abc123xyz_1",
      youtubeVideoId: "import-0",
    },
  ], undefined, { fetcher });

  assert.equal(apiCalls, 1);
  assert.equal(result.exportedCount, 1);
});

test("missing-binary opens YouTube circuit, skips remaining YouTube songs, and still exports later direct audio", async () => {
  let apiCalls = 0;
  let directCalls = 0;
  const fetcher = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/download") {
      apiCalls += 1;
      if (apiCalls > 1) throw new Error("circuit did not open");
      return jsonError("missing-binary", 500);
    }
    if (url === "https://cdn.example.test/after.mp3") {
      directCalls += 1;
      return audioResponse();
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  const result = await createLocalExportZip([
    { id: "yt-1", title: "First", artist: "Artist" },
    { id: "yt-2", title: "Second", artist: "Artist" },
    { id: "direct", title: "After", artist: "Artist", audioUrl: "https://cdn.example.test/after.mp3" },
  ], undefined, { fetcher });

  assert.equal(apiCalls, 1);
  assert.equal(directCalls, 1);
  assert.equal(result.exportedCount, 1);
  assert.equal(result.skippedCount, 2);
  assert.equal(result.failedCount, 0);
  assert.match(result.items[0]?.error || "", /yt-dlp is missing/);
  assert.match(result.items[1]?.error || "", /yt-dlp is missing/);
  assert.notEqual(result.items[1]?.error, "No audio source available for local export.");

  const files = await listZipFiles(result.zipBlob);
  const searchListPath = fileEnding(files, "/metadata/search-list.txt");
  const failedItemsPath = fileEnding(files, "/metadata/failed-items.json");
  assert.ok(searchListPath);
  assert.ok(failedItemsPath);
  assert.match(files.get(searchListPath) || "", /Artist - First/);
  assert.match(files.get(searchListPath) || "", /Artist - Second/);
  const failedItems = JSON.parse(files.get(failedItemsPath) || "[]") as Array<{ code?: string; error?: string }>;
  assert.equal(failedItems.length, 2);
  assert.equal(failedItems[0]?.code, "missing-binary");
});

for (const [code, status] of [["ffmpeg-missing", 500], ["youtube-blocked", 429], ["binary-permission", 500]] as const) {
  test(`${code} opens the YouTube circuit`, async () => {
    let apiCalls = 0;
    const fetcher = async (input: RequestInfo | URL) => {
      if (String(input) === "/api/download") {
        apiCalls += 1;
        if (apiCalls > 1) throw new Error("circuit did not open");
        return jsonError(code, status);
      }
      throw new Error("unexpected fetch");
    };

    const result = await createLocalExportZip([
      { id: "yt-1", title: "First", artist: "Artist" },
      { id: "yt-2", title: "Second", artist: "Artist" },
    ], undefined, { fetcher });

    assert.equal(apiCalls, 1);
    assert.equal(result.skippedCount, 2);
    assert.equal(result.items[0]?.code, code);
    assert.equal(result.items[1]?.code, code);
  });
}
