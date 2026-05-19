import type { UiPersonalization } from "@/lib/ThemeContext";
import { UI_PRESETS } from "@/lib/ThemeContext";
import { SUPPORTED_ACCENTS, type AccentPreset } from "@/lib/themePresets";

export const ASSISTANT_THEME_TEMPLATES = {
  "night-drive": { id: "night-drive", name: "Neon Circuit", presetName: "Neon Circuit" },
  "ocean-pulse": { id: "ocean-pulse", name: "Cyber Grid", presetName: "Cyber Grid" },
  "sunset-glow": { id: "sunset-glow", name: "Urban Poster", presetName: "Urban Poster" },
  "forest-focus": { id: "forest-focus", name: "Organic Signal", presetName: "Organic Signal" },
  "neon-violet": { id: "neon-violet", name: "Arcade Pulse", presetName: "Arcade Pulse" },
  "stock-light": { id: "stock-light", name: "Stock Clean", presetName: "Stock Clean" },
  "stock-dark": { id: "stock-dark", name: "AI Minimal", presetName: "AI Minimal" },
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
