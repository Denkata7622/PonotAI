import test from "node:test";
import assert from "node:assert/strict";
import { GET } from "../app/api/search/route";

test("search route returns structured 503 when youtube key is missing", async () => {
  const previous = process.env.YOUTUBE_API_KEY;
  delete process.env.YOUTUBE_API_KEY;

  try {
    const response = await GET(new Request("http://localhost:3000/api/search?q=test"));
    assert.equal(response.status, 503);
    const payload = (await response.json()) as { error?: string };
    assert.equal(payload.error, "SEARCH_UNAVAILABLE");
  } finally {
    if (previous === undefined) delete process.env.YOUTUBE_API_KEY;
    else process.env.YOUTUBE_API_KEY = previous;
  }
});
