import test from "node:test";
import assert from "node:assert/strict";
import { parseActionIntent } from "../src/services/assistant/actionParser.ts";
import { buildSystemPrompt } from "../src/services/assistant/prompt.ts";

test("well-formed action block is parsed and removed from reply", () => {
  const input = 'Here is your summary.\n<action>{"type":"INSIGHT_REQUEST","confidence":0.9,"payload":{"kind":"trends"},"requiresConfirmation":true}</action>';
  const parsed = parseActionIntent(input);
  assert.equal(parsed.reply, "Here is your summary.");
  assert.equal(parsed.actionIntent?.type, "INSIGHT_REQUEST");
  assert.equal(parsed.parseError, false);
});

test("malformed action block is discarded and text remains clean", () => {
  const input = 'Weekly update is ready. <action>{"type":"INSIGHT_REQUEST","payload":';
  const parsed = parseActionIntent(input);
  assert.equal(parsed.reply, "Weekly update is ready.");
  assert.equal(parsed.actionIntent, null);
  assert.equal(parsed.parseError, true);
});

test("response with no action block keeps text untouched", () => {
  const input = "No action needed right now.";
  const parsed = parseActionIntent(input);
  assert.equal(parsed.reply, input);
  assert.equal(parsed.actionIntent, null);
  assert.equal(parsed.parseError, false);
});

test("long response with trailing action block preserves full text", () => {
  const body = "A".repeat(2500);
  const input = `${body}\n<action>{"type":"DISCOVERY_REQUEST","confidence":0.8,"payload":{"mode":"daily"},"requiresConfirmation":true}</action>`;
  const parsed = parseActionIntent(input);
  assert.equal(parsed.reply.length, body.length);
  assert.equal(parsed.actionIntent?.type, "DISCOVERY_REQUEST");
  assert.equal(parsed.parseError, false);
});

test("theme action rejects unsupported template id", () => {
  const input = '<action>{"type":"CHANGE_THEME","confidence":0.8,"payload":{"template":"made-up","theme":"dark"},"requiresConfirmation":true}</action>';
  const parsed = parseActionIntent(input);
  assert.equal(parsed.actionIntent, null);
  assert.equal(parsed.parseError, true);
});

test("theme action supports dark orange-red combination with valid payload", () => {
  const input = '<action>{"type":"CHANGE_THEME","confidence":0.88,"payload":{"theme":"dark","accent":"sunset","density":"comfortable"},"requiresConfirmation":true}</action>';
  const parsed = parseActionIntent(input);
  assert.equal(parsed.parseError, false);
  assert.deepEqual(parsed.actionIntent?.payload, { theme: "dark", accent: "sunset", density: "comfortable" });
});

test("theme template payload is normalized from authoritative catalog", () => {
  const input = '<action>{"type":"CHANGE_THEME","confidence":0.86,"payload":{"template":"sunset-glow"},"requiresConfirmation":true}</action>';
  const parsed = parseActionIntent(input);
  assert.equal(parsed.parseError, false);
  assert.deepEqual(parsed.actionIntent?.payload, { theme: "light", accent: "sunset", density: "comfortable", template: "sunset-glow" });
});

test("theme action supports custom personalization controls beyond presets", () => {
  const input = '<action>{"type":"CHANGE_THEME","confidence":0.9,"payload":{"theme":"dark","accent":"ruby","panelTint":"rich","surfaceStyle":"elevated","textScale":"lg","displayTextStyle":"cyber-pulse","bodyFont":"manrope","displayFont":"orbitron"},"requiresConfirmation":true}</action>';
  const parsed = parseActionIntent(input);
  assert.equal(parsed.parseError, false);
  assert.deepEqual(parsed.actionIntent?.payload, {
    theme: "dark",
    accent: "ruby",
    panelTint: "rich",
    surfaceStyle: "elevated",
    textScale: "lg",
    displayTextStyle: "cyber-pulse",
    bodyFont: "manrope",
    displayFont: "orbitron",
  });
});

test("theme action rejects invalid custom personalization values", () => {
  const input = '<action>{"type":"CHANGE_THEME","confidence":0.82,"payload":{"panelTint":"ultra","surfaceStyle":"soft"},"requiresConfirmation":true}</action>';
  const parsed = parseActionIntent(input);
  assert.equal(parsed.actionIntent, null);
  assert.equal(parsed.parseError, true);
});

test("system prompt documents sunset glow as light-only and enforces truthful action language", () => {
  const prompt = buildSystemPrompt({
    profile: { totalTracks: 0 },
    topTracks: [],
    recentHistory: [],
    playlists: [],
  });
  assert.match(prompt, /Sunset Glow \(sunset-glow\) => light \+ sunset \+ comfortable \[light-only\]/);
  assert.match(prompt, /Never claim an action is already done unless execution is confirmed/);
});
