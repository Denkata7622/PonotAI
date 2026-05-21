import test from "node:test";
import assert from "node:assert/strict";
import {
  createLocalExportZip,
  type LocalExportSong,
} from "../lib/localDownloadExporter";

const audioBytes = new Uint8Array([0x49, 0x44, 0x33, 0x04]);
const decoder = new TextDecoder();

type ParsedZipEntry = {
  name: string;
  data: Uint8Array;
  localHeaderOffset: number;
  centralHeaderOffset: number;
};

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

function crc32(bytes: Uint8Array): number {
  let c = ~0;
  for (let i = 0; i < bytes.length; i += 1) {
    c ^= bytes[i];
    for (let j = 0; j < 8; j += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  return (~c) >>> 0;
}

function findEndOfCentralDirectory(bytes: Uint8Array, view: DataView): number {
  const minOffset = Math.max(0, bytes.length - 22 - 0xffff);
  for (let offset = bytes.length - 22; offset >= minOffset; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  throw new Error("EOCD not found");
}

async function parseZipEntries(blob: Blob): Promise<Map<string, ParsedZipEntry>> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries = new Map<string, ParsedZipEntry>();
  const eocdOffset = findEndOfCentralDirectory(bytes, view);
  const diskNumber = view.getUint16(eocdOffset + 4, true);
  const centralDisk = view.getUint16(eocdOffset + 6, true);
  const diskEntryCount = view.getUint16(eocdOffset + 8, true);
  const totalEntryCount = view.getUint16(eocdOffset + 10, true);
  const centralDirectorySize = view.getUint32(eocdOffset + 12, true);
  const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);
  const commentLength = view.getUint16(eocdOffset + 20, true);

  assert.equal(diskNumber, 0);
  assert.equal(centralDisk, 0);
  assert.equal(diskEntryCount, totalEntryCount);
  assert.equal(eocdOffset + 22 + commentLength, bytes.length);
  assert.equal(centralDirectoryOffset + centralDirectorySize, eocdOffset);

  let offset = centralDirectoryOffset;
  for (let index = 0; index < totalEntryCount; index += 1) {
    assert.equal(view.getUint32(offset, true), 0x02014b50, `bad central directory signature at ${offset}`);
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const expectedCrc = view.getUint32(offset + 16, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const fileCommentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const nameStart = offset + 46;
    const name = decoder.decode(bytes.slice(nameStart, nameStart + nameLength));

    assert.equal(flags & 0x0008, 0, `${name} must not use a data descriptor`);
    assert.equal(flags & 0x0800, 0x0800, `${name} must declare UTF-8 file names`);
    assert.equal(method, 0, `${name} must use ZIP store method`);
    assert.equal(compressedSize, uncompressedSize, `${name} stored sizes must match`);
    assert.doesNotMatch(name, /\\/);
    assert.doesNotMatch(name, /(^|\/)\.\.(\/|$)/);
    assert.doesNotMatch(name, /^[a-zA-Z]:/);
    assert.doesNotMatch(name, /^\//);

    assert.equal(view.getUint32(localHeaderOffset, true), 0x04034b50, `${name} local header offset must point to a local header`);
    assert.equal(view.getUint16(localHeaderOffset + 6, true), flags);
    assert.equal(view.getUint16(localHeaderOffset + 8, true), method);
    assert.equal(view.getUint32(localHeaderOffset + 14, true), expectedCrc);
    assert.equal(view.getUint32(localHeaderOffset + 18, true), compressedSize);
    assert.equal(view.getUint32(localHeaderOffset + 22, true), uncompressedSize);
    const localNameLength = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
    const localNameStart = localHeaderOffset + 30;
    const localName = decoder.decode(bytes.slice(localNameStart, localNameStart + localNameLength));
    const dataStart = localNameStart + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;

    assert.equal(localName, name);
    assert.ok(dataEnd <= centralDirectoryOffset, `${name} data must end before central directory`);
    const data = bytes.slice(dataStart, dataEnd);
    assert.equal(crc32(data), expectedCrc, `${name} CRC must match file data`);

    entries.set(name, { name, data, localHeaderOffset, centralHeaderOffset: offset });
    offset = nameStart + nameLength + extraLength + fileCommentLength;
  }

  assert.equal(offset, centralDirectoryOffset + centralDirectorySize);
  assert.equal(entries.size, totalEntryCount);
  return entries;
}

async function listZipFiles(blob: Blob): Promise<Map<string, string>> {
  const entries = await parseZipEntries(blob);
  return new Map(Array.from(entries, ([name, entry]) => [name, decoder.decode(entry.data)]));
}

function fileEnding(files: ReadonlyMap<string, unknown>, ending: string): string | undefined {
  return Array.from(files.keys()).find((name) => name.endsWith(ending));
}

function entryEnding(files: ReadonlyMap<string, ParsedZipEntry>, ending: string): ParsedZipEntry | undefined {
  const path = fileEnding(files, ending);
  return path ? files.get(path) : undefined;
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

test("generated ZIP opens through the central directory with one MP3 and metadata files", async () => {
  const result = await createLocalExportZip([
    { id: "one", title: "One", artist: "Artist", blob: new Blob([audioBytes], { type: "audio/mpeg" }) },
  ], undefined, {
    fetcher: async () => {
      throw new Error("unexpected fetch");
    },
  });

  const entries = await parseZipEntries(result.zipBlob);
  const track = entryEnding(entries, "/tracks/Artist - One.mp3");
  assert.ok(track);
  assert.deepEqual(Array.from(track.data), Array.from(audioBytes));
  assert.ok(fileEnding(entries, "/playlists/export.m3u"));
  assert.ok(fileEnding(entries, "/search-list.txt"));
  assert.ok(fileEnding(entries, "/failed-items.json"));
  assert.ok(fileEnding(entries, "/manifest.json"));
  assert.ok(fileEnding(entries, "/metadata/manifest.json"));
});

test("generated ZIP opens through the central directory with 15 MP3 files", async () => {
  const songs: LocalExportSong[] = Array.from({ length: 15 }, (_, index) => ({
    id: `song-${index + 1}`,
    title: `Song ${index + 1}`,
    artist: "Artist",
    blob: new Blob([new Uint8Array([0x49, 0x44, 0x33, index + 1])], { type: "audio/mpeg" }),
  }));

  const result = await createLocalExportZip(songs, undefined, {
    fetcher: async () => {
      throw new Error("unexpected fetch");
    },
  });

  const entries = await parseZipEntries(result.zipBlob);
  const trackEntries = Array.from(entries.values()).filter((entry) => entry.name.includes("/tracks/"));
  assert.equal(trackEntries.length, 15);

  for (let index = 0; index < songs.length; index += 1) {
    const track = entryEnding(entries, `/tracks/Artist - Song ${index + 1}.mp3`);
    assert.ok(track, `missing track ${index + 1}`);
    assert.deepEqual(Array.from(track.data), [0x49, 0x44, 0x33, index + 1]);
  }

  const playlistPath = fileEnding(entries, "/playlists/export.m3u");
  const manifestPath = fileEnding(entries, "/metadata/manifest.json");
  const failedItemsPath = fileEnding(entries, "/failed-items.json");
  assert.ok(playlistPath);
  assert.ok(manifestPath);
  assert.ok(failedItemsPath);

  const playlist = decoder.decode(entries.get(playlistPath)?.data);
  assert.match(playlist, /tracks\/Artist - Song 1\.mp3/);
  assert.match(playlist, /tracks\/Artist - Song 15\.mp3/);

  const manifest = JSON.parse(decoder.decode(entries.get(manifestPath)?.data)) as { exportedCount?: number; items?: unknown[] };
  const failedItems = JSON.parse(decoder.decode(entries.get(failedItemsPath)?.data)) as unknown[];
  assert.equal(manifest.exportedCount, 15);
  assert.equal(manifest.items?.length, 15);
  assert.deepEqual(failedItems, []);
});

test("generated ZIP is valid with zero exported tracks", async () => {
  let apiCalls = 0;
  const result = await createLocalExportZip([
    { id: "blocked-1", title: "Blocked One", artist: "Artist" },
    { id: "blocked-2", title: "Blocked Two", artist: "Artist" },
  ], undefined, {
    fetcher: async (input: RequestInfo | URL) => {
      if (String(input) === "/api/download") {
        apiCalls += 1;
        return jsonError("youtube-blocked", 429);
      }
      throw new Error("unexpected fetch");
    },
  });

  assert.equal(apiCalls, 1);
  assert.equal(result.exportedCount, 0);
  assert.equal(result.skippedCount, 2);

  const entries = await parseZipEntries(result.zipBlob);
  const trackEntries = Array.from(entries.keys()).filter((name) => name.includes("/tracks/"));
  assert.equal(trackEntries.length, 0);
  const failedItemsPath = fileEnding(entries, "/failed-items.json");
  const searchListPath = fileEnding(entries, "/search-list.txt");
  assert.ok(failedItemsPath);
  assert.ok(searchListPath);
  const failedItems = JSON.parse(decoder.decode(entries.get(failedItemsPath)?.data)) as Array<{ code?: string }>;
  assert.equal(failedItems.length, 2);
  assert.equal(failedItems[0]?.code, "youtube-blocked");
  assert.match(decoder.decode(entries.get(searchListPath)?.data), /Artist - Blocked One/);
  assert.match(decoder.decode(entries.get(searchListPath)?.data), /Artist - Blocked Two/);
});

test("generated ZIP sanitizes hostile and unicode track names", async () => {
  const titles = [
    "AC/DC",
    "song:name",
    "name with \"quotes\"",
    "question?mark",
    "pipe|char",
    "star*",
    "angle<brackets>",
    "emoji title 😄",
    "Българска песен",
    "CON",
  ];
  const result = await createLocalExportZip(titles.map((title, index) => ({
    id: `hostile-${index}`,
    title,
    artist: title === "CON" ? "" : "Artist",
    blob: new Blob([audioBytes], { type: "audio/mpeg" }),
  })), undefined, {
    fetcher: async () => {
      throw new Error("unexpected fetch");
    },
  });

  const entries = await parseZipEntries(result.zipBlob);
  const trackPaths = Array.from(entries.keys()).filter((name) => name.includes("/tracks/"));
  assert.equal(trackPaths.length, titles.length);
  assert.ok(trackPaths.some((name) => name.endsWith("/tracks/Artist - AC DC.mp3")));
  assert.ok(trackPaths.some((name) => name.endsWith("/tracks/Artist - emoji title 😄.mp3")));
  assert.ok(trackPaths.some((name) => name.endsWith("/tracks/Artist - Българска песен.mp3")));
  assert.ok(trackPaths.some((name) => name.endsWith("/tracks/_CON.mp3")));

  for (const path of trackPaths) {
    const fileName = path.slice(path.lastIndexOf("/") + 1);
    assert.equal(path.split("/").filter(Boolean).length, 3);
    assert.doesNotMatch(fileName, /[<>:"/\\|?*\u0000-\u001f]/);
    assert.doesNotMatch(fileName, /[. ]+\.mp3$/);
    assert.doesNotMatch(fileName, /^(con|prn|aux|nul|com[1-9]|lpt[1-9])\.mp3$/i);
  }
});

test("export manifest preserves imported metadata", async () => {
  const result = await createLocalExportZip([
    {
      id: "meta",
      title: "Meta Song",
      artist: "Artist",
      audioUrl: "https://cdn.example.test/song.mp3",
      platformLinks: { youtube: "https://www.youtube.com/watch?v=abc123xyz_1", spotify: "https://open.spotify.com/track/test" },
      metadata: { rawText: "Artist - Meta Song", selectedCoverUrl: "https://img.example.test/cover.jpg" },
    },
  ], undefined, {
    fetcher: async () => audioResponse(),
  });

  const files = await listZipFiles(result.zipBlob);
  const manifestPath = fileEnding(files, "/metadata/manifest.json");
  assert.ok(manifestPath);
  const manifest = JSON.parse(files.get(manifestPath) || "{}") as { items: Array<{ metadata?: Record<string, unknown> }> };
  assert.equal((manifest.items[0]?.metadata as { rawText?: string } | undefined)?.rawText, "Artist - Meta Song");
  assert.deepEqual((manifest.items[0]?.metadata as { platformLinks?: unknown } | undefined)?.platformLinks, {
    youtube: "https://www.youtube.com/watch?v=abc123xyz_1",
    spotify: "https://open.spotify.com/track/test",
  });
});

test("YouTube page URL is not browser-fetched and invalid youtubeVideoId is not passed", async () => {
  let apiCalls = 0;
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    assert.doesNotMatch(url, /youtube\.com|youtu\.be/);
    if (url === "/api/download") {
      apiCalls += 1;
      const body = JSON.parse(String(init?.body)) as { youtubeId?: string; query?: string };
      assert.equal(body.youtubeId, undefined);
      assert.equal((body as { youtubeUrl?: string }).youtubeUrl, "https://www.youtube.com/watch?v=abc123xyz_1");
      assert.equal(body.query, undefined);
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
  assert.equal(result.items[0]?.sourceAttempted, "youtube-url");
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
  assert.equal((failedItems[1] as { youtubeCircuitOpen?: boolean })?.youtubeCircuitOpen, true);
});

test("file and blob still export after a global YouTube missing-binary failure", async () => {
  let apiCalls = 0;
  const fetcher = async (input: RequestInfo | URL) => {
    if (String(input) === "/api/download") {
      apiCalls += 1;
      return jsonError("missing-binary", 503);
    }
    throw new Error("unexpected fetch");
  };

  const result = await createLocalExportZip([
    { id: "yt", title: "Needs YouTube", artist: "Artist" },
    { id: "file", title: "Local File", artist: "Artist", file: new File([audioBytes], "local.mp3", { type: "audio/mpeg" }) },
    { id: "blob", title: "Local Blob", artist: "Artist", blob: new Blob([audioBytes], { type: "audio/mpeg" }) },
  ], undefined, { fetcher });

  assert.equal(apiCalls, 1);
  assert.equal(result.exportedCount, 2);
  assert.equal(result.skippedCount, 1);
  assert.equal(result.items[1]?.sourceAttempted, "file");
  assert.equal(result.items[2]?.sourceAttempted, "blob");
});

test("failed-items includes code fix detail and search-list includes only unresolved tracks", async () => {
  const result = await createLocalExportZip([
    { id: "yt", title: "Blocked", artist: "Artist" },
    { id: "direct", title: "Direct", artist: "Artist", audioUrl: "https://cdn.example.test/direct.mp3" },
  ], undefined, {
    fetcher: async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/download") return jsonError("youtube-blocked", 429);
      if (url === "https://cdn.example.test/direct.mp3") return audioResponse();
      throw new Error(`unexpected fetch ${url}`);
    },
    appVersion: "test-version",
    diagnosticsSnapshot: { mode: "cloud", ok: false },
  });

  const files = await listZipFiles(result.zipBlob);
  const failedItemsPath = fileEnding(files, "/metadata/failed-items.json");
  const searchListPath = fileEnding(files, "/metadata/search-list.txt");
  const manifestPath = fileEnding(files, "/metadata/manifest.json");
  const playlistPath = fileEnding(files, "/playlists/export.m3u");
  assert.ok(failedItemsPath);
  assert.ok(searchListPath);
  assert.ok(manifestPath);
  assert.ok(playlistPath);

  const failedItems = JSON.parse(files.get(failedItemsPath) || "[]") as Array<{ code?: string; fix?: string; detail?: string }>;
  assert.equal(failedItems.length, 1);
  assert.equal(failedItems[0]?.code, "youtube-blocked");
  assert.equal(failedItems[0]?.fix, "youtube-blocked fix");
  assert.equal(failedItems[0]?.detail, "youtube-blocked detail");
  assert.equal(files.get(searchListPath)?.trim(), "Artist - Blocked");
  assert.doesNotMatch(files.get(searchListPath) || "", /Direct/);

  const manifest = JSON.parse(files.get(manifestPath) || "{}") as { appVersion?: string; diagnostics?: { mode?: string }; exportedCount?: number };
  assert.equal(manifest.appVersion, "test-version");
  assert.equal(manifest.diagnostics?.mode, "cloud");
  assert.equal(manifest.exportedCount, 1);
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

test("failed cover fetch does not fail export", async () => {
  const fetcher = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "https://cdn.example.test/song.mp3") return audioResponse();
    if (url === "https://cdn.example.test/cover.jpg") return new Response(null, { status: 404 });
    throw new Error(`unexpected fetch ${url}`);
  };

  const result = await createLocalExportZip([
    { id: "cover", title: "Cover Song", artist: "Artist", audioUrl: "https://cdn.example.test/song.mp3", coverUrl: "https://cdn.example.test/cover.jpg" },
  ], undefined, { fetcher });

  assert.equal(result.exportedCount, 1);
  assert.equal(result.failedCount, 0);
  assert.match(result.items[0]?.warnings?.join(" ") ?? "", /Cover could not be fetched/);
});

test("progress includes expected phases and done", async () => {
  const phases: string[] = [];
  const result = await createLocalExportZip([
    { id: "direct", title: "Direct Song", artist: "Artist", audioUrl: "https://cdn.example.test/song.mp3" },
  ], (progress) => {
    phases.push(progress.phase);
  }, {
    fetcher: async () => audioResponse(),
  });

  assert.equal(result.exportedCount, 1);
  assert.deepEqual(phases, ["preparing", "fetching-audio", "adding-files", "finalizing", "done"]);
});

test("default batch delay is zero for YouTube downloads", async () => {
  let apiCalls = 0;
  const started = Date.now();
  await createLocalExportZip([
    { id: "yt-1", title: "First", artist: "Artist" },
    { id: "yt-2", title: "Second", artist: "Artist" },
  ], undefined, {
    fetcher: async (input: RequestInfo | URL) => {
      if (String(input) === "/api/download") {
        apiCalls += 1;
        return audioResponse();
      }
      throw new Error("unexpected fetch");
    },
  });

  assert.equal(apiCalls, 2);
  assert.ok(Date.now() - started < 1000);
});
