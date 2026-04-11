import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { startTestServer } from "./helpers/testHarness.ts";

async function register(baseUrl: string, username: string, email: string) {
  return fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, email, password: "password123" }),
  });
}

test("admin demo account generation returns one-time credentials with explicit account shape", async () => {
  process.env.ADMIN_EMAIL = "admin@trackly.test";
  const running = await startTestServer();

  try {
    const registerResponse = await register(running.baseUrl, "trackly_admin", "admin@trackly.test");
    assert.equal(registerResponse.status, 201);
    const registerBody = (await registerResponse.json()) as { token: string };

    const demoResponse = await fetch(`${running.baseUrl}/api/admin/demo-account`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${registerBody.token}` },
      body: JSON.stringify({ persona: "gym" }),
    });
    assert.equal(demoResponse.status, 201);
    const demoBody = (await demoResponse.json()) as {
      account: {
        id: string;
        name: string;
        email: string;
        password: string;
        role: string;
        persona: string;
        createdAt: string;
      };
    };
    assert.equal(typeof demoBody.account.id, "string");
    assert.equal(typeof demoBody.account.name, "string");
    assert.equal(typeof demoBody.account.email, "string");
    assert.equal(typeof demoBody.account.password, "string");
    assert.equal(demoBody.account.role, "user");
    assert.equal(demoBody.account.persona, "gym");
    assert.equal(typeof demoBody.account.createdAt, "string");

    const loginResponse = await fetch(`${running.baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: demoBody.account.email, password: demoBody.account.password }),
    });
    assert.equal(loginResponse.status, 200);

    const dbContents = await readFile(path.join(process.env.PONOTAI_DATA_DIR!, "appdb.json"), "utf8");
    assert.equal(dbContents.includes(demoBody.account.password), false);
    const db = JSON.parse(dbContents) as { users: Array<{ email: string; passwordHash: string }> };
    const savedUser = db.users.find((user) => user.email === demoBody.account.email);
    assert.ok(savedUser);
    assert.notEqual(savedUser.passwordHash, demoBody.account.password);
  } finally {
    await running.close();
    delete process.env.ADMIN_EMAIL;
  }
});

test("non-admin cannot generate demo accounts and cannot access admin overview", async () => {
  const running = await startTestServer();

  try {
    const registerResponse = await register(running.baseUrl, "basic_user", "basic@trackly.test");
    assert.equal(registerResponse.status, 201);
    const registerBody = (await registerResponse.json()) as { token: string };

    const demoResponse = await fetch(`${running.baseUrl}/api/admin/demo-account`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${registerBody.token}` },
      body: JSON.stringify({ persona: "gym" }),
    });
    assert.equal(demoResponse.status, 403);

    const overviewResponse = await fetch(`${running.baseUrl}/api/admin/overview`, {
      headers: { authorization: `Bearer ${registerBody.token}` },
    });
    assert.equal(overviewResponse.status, 403);
  } finally {
    await running.close();
  }
});
