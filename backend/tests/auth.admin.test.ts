import test from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers/testHarness.ts";

async function register(baseUrl: string, username: string, email: string) {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, email, password: "password123" }),
  });
  return response;
}

test("ADMIN_EMAIL user is bootstrapped as admin and can access admin routes", async () => {
  process.env.ADMIN_EMAIL = "owner@test.dev";
  const running = await startTestServer();

  try {
    const response = await register(running.baseUrl, "owner_user", "owner@test.dev");
    assert.equal(response.status, 201);
    const body = (await response.json()) as { token: string; user: { role: string } };
    assert.equal(body.user.role, "admin");

    const meResponse = await fetch(`${running.baseUrl}/api/auth/me`, {
      headers: { authorization: `Bearer ${body.token}` },
    });
    assert.equal(meResponse.status, 200);
    const meBody = (await meResponse.json()) as { user: { role: string }; token: string };
    assert.equal(meBody.user.role, "admin");
    assert.equal(typeof meBody.token, "string");

    const adminResponse = await fetch(`${running.baseUrl}/api/admin/overview`, {
      headers: { authorization: `Bearer ${body.token}` },
    });
    assert.equal(adminResponse.status, 200);
  } finally {
    await running.close();
    delete process.env.ADMIN_EMAIL;
  }
});

test("normal user is forbidden from admin routes", async () => {
  const running = await startTestServer();

  try {
    const response = await register(running.baseUrl, "normal_user", "normal@test.dev");
    assert.equal(response.status, 201);
    const body = (await response.json()) as { token: string; user: { role: string } };
    assert.equal(body.user.role, "user");

    const adminResponse = await fetch(`${running.baseUrl}/api/admin/overview`, {
      headers: { authorization: `Bearer ${body.token}` },
    });
    assert.equal(adminResponse.status, 403);
  } finally {
    await running.close();
  }
});
