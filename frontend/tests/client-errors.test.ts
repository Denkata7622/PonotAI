import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../app/api/client-errors/route";
import { sanitizeClientErrorValue } from "../lib/clientErrorSanitizer";
import { reportClientError, shouldIgnoreClientError } from "../src/components/ClientErrorReporter";

test("client error endpoint logs sanitized reports and redacts sensitive keys", async () => {
  const originalError = console.error;
  const logs: string[] = [];
  console.error = (...args: unknown[]) => { logs.push(args.map(String).join(" ")); };
  try {
    const response = await POST(new Request("http://test.local/api/client-errors", {
      method: "POST",
      body: JSON.stringify({
        message: "boom",
        stack: "Authorization: Bearer stack-secret token=stack-secret",
        route: "/download",
        authorization: "Bearer secret",
        nested: { password: "secret" },
      }),
    }));

    assert.equal(response.status, 204);
    assert.equal(logs.length, 1);
    assert.match(logs[0] ?? "", /\[redacted\]/);
    assert.doesNotMatch(logs[0] ?? "", /Bearer secret|stack-secret|password":"secret/);
  } finally {
    console.error = originalError;
  }
});

test("client error endpoint handles malformed and oversized payloads safely", async () => {
  const malformed = await POST(new Request("http://test.local/api/client-errors", {
    method: "POST",
    body: "{",
  }));
  assert.equal(malformed.status, 204);

  const oversized = await POST(new Request("http://test.local/api/client-errors", {
    method: "POST",
    body: "x".repeat(20_000),
  }));
  assert.equal(oversized.status, 204);
});

test("client error reporter filters extension and ResizeObserver noise", () => {
  assert.equal(shouldIgnoreClientError("boom", "chrome-extension://abc"), true);
  assert.equal(shouldIgnoreClientError("ResizeObserver loop limit exceeded"), true);
  assert.equal(shouldIgnoreClientError("real failure", "/download"), false);
});

test("client error reporter posts browser errors to server endpoint", () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const originalFetch = globalThis.fetch;
  const calls: Array<{ input: string; body?: string }> = [];

  try {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { location: { pathname: "/download" } },
    });
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { userAgent: "node-test", sendBeacon: undefined },
    });
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input: String(input), body: String(init?.body ?? "") });
      return Promise.resolve(new Response(null, { status: 204 }));
    }) as typeof fetch;

    reportClientError({ message: `real failure ${Date.now()}`, stack: "stack", source: "test" });

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.input, "/api/client-errors");
    assert.match(calls[0]?.body ?? "", /real failure/);
    assert.match(calls[0]?.body ?? "", /"route":"\/download"/);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else delete (globalThis as { window?: unknown }).window;
    if (previousNavigator) Object.defineProperty(globalThis, "navigator", previousNavigator);
    else delete (globalThis as { navigator?: unknown }).navigator;
  }
});

test("client error sanitizer redacts nested secrets", () => {
  const sanitized = sanitizeClientErrorValue({
    token: "abc",
    stack: "token=abc Authorization: Bearer def",
    nested: { apiKey: "def", ok: true },
  });
  assert.deepEqual(sanitized, {
    token: "[redacted]",
    stack: "token=[redacted] Authorization: Bearer [redacted]",
    nested: { apiKey: "[redacted]", ok: true },
  });
});
