import test from "node:test";
import assert from "node:assert/strict";
import { queueDocumentMutation } from "../src/db/persistence.ts";

test("queueDocumentMutation serializes operations by key", async () => {
  const order: string[] = [];

  await Promise.all([
    queueDocumentMutation("unit-test-doc", async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      order.push("first");
    }),
    queueDocumentMutation("unit-test-doc", async () => {
      order.push("second");
    }),
  ]);

  assert.deepEqual(order, ["first", "second"]);
});
