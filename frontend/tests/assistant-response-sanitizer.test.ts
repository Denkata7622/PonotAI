import test from "node:test";
import assert from "node:assert/strict";
import { stripAssistantActionMarkup } from "../src/features/assistant/responseSanitizer";

test("frontend sanitizer strips action payload from visible chat text", () => {
  const text = 'Nice picks for this week.\n<action>{"type":"INSIGHT_REQUEST","payload":{"kind":"trends"}}</action>';
  assert.equal(stripAssistantActionMarkup(text), "Nice picks for this week.");
});

test("frontend sanitizer drops partial action payload fragments", () => {
  const text = 'Nice picks for this week.\n<action>{"type":"INSIGHT_REQUEST","payload":';
  assert.equal(stripAssistantActionMarkup(text), "Nice picks for this week.");
});
