import test from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers/testHarness.ts";

async function register(baseUrl: string, username: string, email: string) {
  return fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, email, password: "password123" }),
  });
}

test("admin overview returns expanded operational metrics and no-store caching", async () => {
  process.env.ADMIN_EMAIL = "admin+overview@test.dev";
  const running = await startTestServer();

  try {
    const registerResponse = await register(running.baseUrl, "overview_admin", "admin+overview@test.dev");
    assert.equal(registerResponse.status, 201);
    const registerBody = (await registerResponse.json()) as { token: string };

    const overviewResponse = await fetch(`${running.baseUrl}/api/admin/overview?windowDays=1&eventType=assistant`, {
      headers: { authorization: `Bearer ${registerBody.token}` },
    });
    assert.equal(overviewResponse.status, 200);
    assert.equal(overviewResponse.headers.get("cache-control"), "no-store");

    const body = (await overviewResponse.json()) as {
      totals: { favorites: number; historyEntries: number };
      users: { signups: { last7d: number; last30d: number }; activeUsers: { recognizedLast7d: number } };
      recognitions: { totals: { recorded: number }; methodBreakdown: Record<string, number> };
      library: { playlistSongCount: number; averages: { favoritesPerUser: number } };
      health: { persistence: { status: string }; recognitionProviders: { availableCount: number } };
      providerAvailability: Record<string, boolean>;
      monitoring: {
        filters: { windowDays: number; eventType: string };
        recognitionActivity: { successRatePctInWindow: number; recentFailures: Array<{ id: string }> };
        assistantActivity: { requestsInWindow: number; recentRequests: Array<{ id: string }> };
        recentEvents: Array<{ type: string }>;
      };
    };

    assert.equal(typeof body.totals.favorites, "number");
    assert.equal(typeof body.totals.historyEntries, "number");
    assert.equal(typeof body.users.signups.last7d, "number");
    assert.equal(typeof body.users.signups.last30d, "number");
    assert.equal(typeof body.users.activeUsers.recognizedLast7d, "number");
    assert.equal(typeof body.recognitions.totals.recorded, "number");
    assert.equal(typeof body.recognitions.methodBreakdown, "object");
    assert.equal(typeof body.library.playlistSongCount, "number");
    assert.equal(typeof body.library.averages.favoritesPerUser, "number");
    assert.ok(body.health.persistence.status === "ok" || body.health.persistence.status === "degraded");
    assert.equal(typeof body.health.recognitionProviders.availableCount, "number");
    assert.equal(typeof body.providerAvailability.assistantGemini, "boolean");
    assert.equal(body.monitoring.filters.windowDays, 1);
    assert.equal(body.monitoring.filters.eventType, "assistant");
    assert.equal(typeof body.monitoring.recognitionActivity.successRatePctInWindow, "number");
    assert.ok(Array.isArray(body.monitoring.recognitionActivity.recentFailures));
    assert.equal(typeof body.monitoring.assistantActivity.requestsInWindow, "number");
    assert.ok(Array.isArray(body.monitoring.assistantActivity.recentRequests));
    assert.ok(Array.isArray(body.monitoring.recentEvents));
    assert.ok(body.monitoring.recentEvents.every((item) => item.type === "assistant"));
  } finally {
    await running.close();
    delete process.env.ADMIN_EMAIL;
  }
});
