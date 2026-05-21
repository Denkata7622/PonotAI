import assert from "node:assert/strict";
import test from "node:test";
import {
  THEME_PRESET_DEFINITIONS,
  UI_PRESETS,
  applyAccentVariables,
  findMatchingThemePresetId,
  getThemePreviewTokens,
  isValidThemePresetId,
  themeStorageKeys,
} from "../lib/ThemeContext";
import { ACCENT_TOKENS, getAccentCssVariables, normalizeAccentPreset } from "../lib/themePresets";
import ThemePresetCard, { THEME_PRESET_CARD_CLASS } from "../src/components/theme/ThemePresetCard";
import { THEME_PRESET_IDS as BACKEND_THEME_PRESET_IDS } from "../../backend/src/modules/personalization/themePresetCatalog.ts";

test("normalizeAccentPreset falls back for unsupported accent values", () => {
  assert.equal(normalizeAccentPreset("ocean"), "ocean");
  assert.equal(normalizeAccentPreset("midnight"), "violet");
});

test("getAccentCssVariables returns expanded UI token variables", () => {
  const cssVars = getAccentCssVariables("emerald", "vivid", "multicolor");
  assert.equal(cssVars["--accent"], "#10b981");
  assert.ok(cssVars["--accent-ring"].includes("16, 185, 129"));
  assert.ok(cssVars["--chart-2"]);
});

test("applyAccentVariables writes accent data and css variables to root", () => {
  const values = new Map<string, string>();
  const root = {
    setAttribute: (key: string, value: string) => values.set(key, value),
    style: {
      setProperty: (key: string, value: string) => values.set(key, value),
    },
  };
  Object.defineProperty(globalThis, "document", { value: { documentElement: root }, configurable: true });

  applyAccentVariables("ruby", "subtle", "neutral");

  assert.equal(values.get("data-accent"), "ruby");
  assert.equal(values.get("--accent"), "#be123c");
  assert.ok(values.get("--accent-soft")?.includes("190, 18, 60"));
});


test("theme storage includes typography split keys", () => {
  assert.equal(themeStorageKeys.presetId, "ponotai-theme-preset-id");
  assert.equal(themeStorageKeys.cardEmphasis, "ponotai-card-emphasis");
  assert.equal(themeStorageKeys.chartStyle, "ponotai-chart-style");
  assert.equal(themeStorageKeys.bodyFont, "ponotai-body-font");
  assert.equal(themeStorageKeys.displayFont, "ponotai-display-font");
  assert.equal(themeStorageKeys.displayTextStyle, "ponotai-display-text-style");
});

test("ui presets define expressive typography for all templates", () => {
  for (const preset of Object.values(UI_PRESETS)) {
    assert.ok(["static", "soft-gradient", "subtle-glow", "slight-depth", "cyber-pulse", "shadowed-poster"].includes(preset.displayTextStyle));
    assert.ok(typeof preset.bodyFont === "string");
    assert.ok(typeof preset.displayFont === "string");
  }
});

test("creative presets are registered", () => {
  assert.equal(UI_PRESETS["stock-clean"]?.theme, "light");
  assert.equal(UI_PRESETS["cyber-grid"]?.displayFont, "orbitron");
  assert.equal(UI_PRESETS["noir-gothic"]?.displayFont, "pirata-one");
});

test("theme preset registry has unique real IDs and names", () => {
  const ids = THEME_PRESET_DEFINITIONS.map((preset) => preset.id);
  const names = THEME_PRESET_DEFINITIONS.map((preset) => preset.name);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.length, Object.keys(UI_PRESETS).length);
  assert.deepEqual(names, [
    "Stock Clean",
    "AI Minimal",
    "Cyber Grid",
    "Neon Circuit",
    "Urban Poster",
    "Velvet Script",
    "Steel Console",
    "Arcade Pulse",
    "Noir Gothic",
    "Organic Signal",
  ]);
  assert.deepEqual(BACKEND_THEME_PRESET_IDS, ids);
  for (const preset of THEME_PRESET_DEFINITIONS) {
    assert.match(preset.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(isValidThemePresetId(preset.id));
    assert.deepEqual(UI_PRESETS[preset.id], preset.personalization);
    assert.equal(findMatchingThemePresetId(preset.personalization), preset.id);
  }
});

test("theme preview tokens are derived from the selected preset accent and mode", () => {
  for (const preset of THEME_PRESET_DEFINITIONS) {
    const preview = getThemePreviewTokens(preset);
    const accent = ACCENT_TOKENS[preset.personalization.accent];
    assert.equal(preview.accent, accent.accent);
    assert.equal(preview.accent2, accent.accent2);
    if (preset.personalization.theme === "light") {
      assert.equal(preview.background, "#f5f7fa");
    } else {
      assert.equal(preview.background, "#0b0d12");
    }
  }
});

test("theme preset cards render directly from registry metadata", () => {
  assert.ok(THEME_PRESET_CARD_CLASS.includes("h-[22rem]"));
  assert.ok(THEME_PRESET_CARD_CLASS.includes("max-w-[12rem]"));

  for (const preset of THEME_PRESET_DEFINITIONS) {
    const element = ThemePresetCard({
      preset,
      selected: false,
      saved: false,
      onSelect: () => undefined,
    }) as {
      props: {
        "aria-label": string;
        id: string;
        style: { background: string; color: string };
      };
    };
    const tokens = getThemePreviewTokens(preset);
    assert.equal(element.props.id, `theme-preset-${preset.id}`);
    assert.equal(element.props["aria-label"], `Preview ${preset.name} theme preset`);
    assert.ok(element.props.style.background.includes(tokens.background));
    assert.equal(element.props.style.color, tokens.text);
  }
});
