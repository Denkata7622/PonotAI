import test from "node:test";
import assert from "node:assert/strict";
import { sendAssistantMessage } from "../src/features/assistant/api";

test("assistant request keeps rich context in body and avoids unsafe custom headers", async () => {
  const originalWindow = globalThis.window;
  const originalNavigator = globalThis.navigator;
  const originalFetch = globalThis.fetch;

  let capturedInit: RequestInit | undefined;
  try {
    const localStorage = {
      getItem(key: string) {
        if (key === "ponotii_token") return "token-123";
        if (key === "ponotai-theme") return "dark";
        if (key === "ponotai-language") return "en";
        if (key === "ponotai.queue.v1") {
          return JSON.stringify({
            queue: [
              { track: { title: "Beyoncé – Halo 🎵" } },
            ],
          });
        }
        return null;
      },
    };
    Object.defineProperty(globalThis, "window", {
      value: { localStorage, location: { hostname: "localhost" } },
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, "navigator", {
      value: { userAgent: "Trackly Test Agent 🎧" },
      configurable: true,
      writable: true,
    });
    globalThis.fetch = (async (_input, init) => {
      capturedInit = init;
      return {
        ok: true,
        json: async () => ({ reply: "ok", actionIntent: null, meta: { model: "test", latencyMs: 5, contextTracksCount: 1 } }),
      } as Response;
    }) as typeof fetch;

    const payload = await sendAssistantMessage([], "hello");
    assert.equal(payload.reply, "ok");
    assert.ok(capturedInit);
    const headers = capturedInit?.headers as Record<string, string>;
    assert.equal(headers["Content-Type"], "application/json");
    assert.equal(headers.Authorization, "Bearer token-123");
    assert.equal(headers["X-Trackly-Queue"], undefined);
    assert.equal(headers["X-Trackly-Preferences"], undefined);
    assert.equal(headers["X-Trackly-Device"], undefined);

    const body = JSON.parse(String(capturedInit?.body)) as {
      context?: { queueTitles?: string[]; theme?: string; language?: string; device?: string };
    };
    assert.deepEqual(body.context?.queueTitles, ["Beyoncé – Halo 🎵"]);
    assert.equal(body.context?.theme, "dark");
    assert.equal(body.context?.language, "en");
    assert.equal(body.context?.device, "Trackly Test Agent ");
  } finally {
    Object.defineProperty(globalThis, "window", {
      value: originalWindow,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, "navigator", {
      value: originalNavigator,
      configurable: true,
      writable: true,
    });
    globalThis.fetch = originalFetch;
  }
});
