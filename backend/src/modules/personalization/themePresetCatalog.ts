export const THEME_PRESET_IDS = [
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
] as const;

export type ThemePresetId = (typeof THEME_PRESET_IDS)[number];

export function isValidThemePresetId(value: unknown): value is ThemePresetId {
  return typeof value === "string" && THEME_PRESET_IDS.includes(value as ThemePresetId);
}
