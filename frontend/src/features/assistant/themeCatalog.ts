import type { UiPersonalization } from "@/lib/ThemeContext";
import { UI_PRESETS } from "@/lib/ThemeContext";
import { SUPPORTED_ACCENTS, type AccentPreset } from "@/lib/themePresets";

export const ASSISTANT_THEME_TEMPLATES = {
  "night-drive": { id: "night-drive", name: "Night Drive", presetName: "Neon Circuit" },
  "ocean-pulse": { id: "ocean-pulse", name: "Ocean Pulse", presetName: "Cyber Grid" },
  "sunset-glow": { id: "sunset-glow", name: "Sunset Glow", presetName: "Urban Poster" },
  "forest-focus": { id: "forest-focus", name: "Forest Focus", presetName: "Organic Signal" },
  "neon-violet": { id: "neon-violet", name: "Neon Violet", presetName: "Arcade Pulse" },
  "stock-light": { id: "stock-light", name: "Stock Light", presetName: "Stock Clean" },
  "stock-dark": { id: "stock-dark", name: "Stock Dark", presetName: "AI Minimal" },
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
