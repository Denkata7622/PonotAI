import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import app from "../src/app.ts";

type StandardError = {
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
};

let server: Server;
let baseUrl = "";

before(async () => {
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

function assertStandardErrorShape(body: unknown): asserts body is StandardError {
  assert.equal(typeof body, "object");
  assert.ok(body !== null);
  const asRecord = body as Record<string, unknown>;
  assert.equal(typeof asRecord.code, "string");
  assert.equal(typeof asRecord.message, "string");

  const allowedKeys = new Set(["code", "message", "details", "requestId"]);
  for (const key of Object.keys(asRecord)) {
    assert.ok(allowedKeys.has(key), `Unexpected key in error payload: ${key}`);
  }

  if ("requestId" in asRecord && asRecord.requestId !== undefined) {
    assert.equal(typeof asRecord.requestId, "string");
  }
}

test("auth validation endpoint returns standardized error shape", async () => {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-request-id": "req-auth-1",
    },
    body: JSON.stringify({ username: "x", email: "valid@example.com", password: "password123" }),
  });

  assert.equal(response.status, 400);
  const body = (await response.json()) as unknown;
  assertStandardErrorShape(body);
  assert.equal(body.code, "INVALID_USERNAME");
  assert.equal(body.requestId, "req-auth-1");
});

test("protected endpoint returns standardized unauthorized response", async () => {
  const response = await fetch(`${baseUrl}/api/favorites`);

  assert.equal(response.status, 401);
  const body = (await response.json()) as unknown;
  assertStandardErrorShape(body);
  assert.equal(body.code, "UNAUTHORIZED");
});

test("not found endpoint returns standardized error shape", async () => {
  const response = await fetch(`${baseUrl}/api/share/not-a-real-code`);

  assert.equal(response.status, 404);
  const body = (await response.json()) as unknown;
  assertStandardErrorShape(body);
  assert.equal(body.code, "NOT_FOUND");
});

test("guest history validation error keeps standardized shape", async () => {
  const response = await fetch(`${baseUrl}/api/history`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });

  assert.equal(response.status, 400);
  const body = (await response.json()) as unknown;
  assertStandardErrorShape(body);
  assert.equal(body.code, "INVALID_PAYLOAD");
});
