import test from "node:test";
import assert from "node:assert/strict";
import { runUnifiedSearch } from "../lib/searchClient";

test("unified search queries personalized fuzzy + discover paths for authenticated users", async () => {
  const originalFetch = globalThis.fetch;
  const prevApiBase = process.env.NEXT_PUBLIC_API_BASE_URL;
  process.env.NEXT_PUBLIC_API_BASE_URL = "https://api.example.com";
  const calls: string[] = [];

  try {
    globalThis.fetch = (async (input: string | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.startsWith("https://api.example.com/api/search/fuzzy")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ items: [{ id: "1", type: "history", title: "Song", artist: "Artist", score: 0.8 }] }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ([{ videoId: "v1", title: "Song", artist: "Artist", thumbnailUrl: "https://img" }]),
      } as Response;
    }) as typeof fetch;

    const result = await runUnifiedSearch("song", "token-value");
    assert.equal(result.personalized.length, 1);
    assert.equal(result.discover.length, 1);
    assert.equal(calls.some((url) => url.includes("/api/search/fuzzy")), true);
    assert.equal(calls.some((url) => url.startsWith("/api/search?q=song")), true);
  } finally {
    globalThis.fetch = originalFetch;
    if (prevApiBase === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL;
    else process.env.NEXT_PUBLIC_API_BASE_URL = prevApiBase;
  }
});
