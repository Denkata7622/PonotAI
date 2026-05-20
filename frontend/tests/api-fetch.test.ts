import assert from "node:assert/strict";
import test from "node:test";
import { apiFetch } from "../src/lib/apiFetch";

function restoreEnv(snapshot: { base?: string; node?: string }) {
  if (snapshot.base === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL;
  else process.env.NEXT_PUBLIC_API_BASE_URL = snapshot.base;
  if (snapshot.node === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = snapshot.node;
}

test("apiFetch builds backend requests with bearer token and credentials", async () => {
  const originalFetch = globalThis.fetch;
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const snapshot = { base: process.env.NEXT_PUBLIC_API_BASE_URL, node: process.env.NODE_ENV };
  try {
    process.env.NODE_ENV = "production";
    process.env.NEXT_PUBLIC_API_BASE_URL = "https://api.example.test";
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: { getItem: (key: string) => key === "ponotii_token" ? "token-123" : null },
      },
    });

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(String(input), "https://api.example.test/api/auth/me");
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("Authorization"), "Bearer token-123");
      assert.equal(init?.credentials, "include");
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    const response = await apiFetch("/api/auth/me");
    assert.equal(response.status, 200);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else delete (globalThis as { window?: unknown }).window;
    restoreEnv(snapshot);
  }
});
