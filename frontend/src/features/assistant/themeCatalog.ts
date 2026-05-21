import type { UiPersonalization } from "@/lib/ThemeContext";
import { UI_PRESETS } from "@/lib/ThemeContext";
import { SUPPORTED_ACCENTS, type AccentPreset } from "@/lib/themePresets";

export const ASSISTANT_THEME_TEMPLATES = {
  "night-drive": { id: "night-drive", name: "Neon Circuit", presetName: "neon-circuit" },
  "ocean-pulse": { id: "ocean-pulse", name: "Cyber Grid", presetName: "cyber-grid" },
  "sunset-glow": { id: "sunset-glow", name: "Urban Poster", presetName: "urban-poster" },
  "forest-focus": { id: "forest-focus", name: "Organic Signal", presetName: "organic-signal" },
  "neon-violet": { id: "neon-violet", name: "Arcade Pulse", presetName: "arcade-pulse" },
  "stock-light": { id: "stock-light", name: "Stock Clean", presetName: "stock-clean" },
  "stock-dark": { id: "stock-dark", name: "AI Minimal", presetName: "ai-minimal" },
} as const;

export type AssistantThemeTemplateId = keyof typeof ASSISTANT_THEME_TEMPLATES;

export function isAssistantTemplateId(value: unknown): value is AssistantThemeTemplateId {
  return typeof value === "string" && value in ASSISTANT_THEME_TEMPLATES;
}

export function resolveTemplatePreset(id: AssistantThemeTemplateId): UiPersonalization {
  const presetName = ASSISTANT_THEME_TEMPLATES[id].presetName;
  return UI_PRESETS[presetName];
}

export function isSupportedAssistantAccent(value: unknown): value is AccentPreset {
  return typeof value === "string" && (SUPPORTED_ACCENTS as readonly string[]).includes(value);
}
