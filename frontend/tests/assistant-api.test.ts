import test from "node:test";
import assert from "node:assert/strict";
import { runAssistantAction } from "../src/features/assistant/api";

test("runAssistantAction throws when backend action execution fails", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => ({
      ok: false,
      status: 500,
      json: async () => ({ message: "boom" }),
    })) as typeof fetch;

    await assert.rejects(
      () => runAssistantAction({
        type: "INSIGHT_REQUEST",
        confidence: 0.8,
        payload: { kind: "trends" },
        requiresConfirmation: true,
      }),
      /boom/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
