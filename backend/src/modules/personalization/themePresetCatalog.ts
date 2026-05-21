export const THEME_PRESET_IDS = [
  "stock-clean",
  "ai-minimal",
  "cyber-grid",
  "neon-circuit",
  "urban-poster",
  "velvet-script",
  "steel-console",
  "arcade-pulse",
  "noir-gothic",
  "organic-signal",
] as const;

export type ThemePresetId = (typeof THEME_PRESET_IDS)[number];

export const THEME_PRESET_DISPLAY_NAMES: Record<ThemePresetId, string> = {
  "stock-clean": "Stock Clean",
  "ai-minimal": "AI Minimal",
  "cyber-grid": "Cyber Grid",
  "neon-circuit": "Neon Circuit",
  "urban-poster": "Urban Poster",
  "velvet-script": "Velvet Script",
  "steel-console": "Steel Console",
  "arcade-pulse": "Arcade Pulse",
  "noir-gothic": "Noir Gothic",
  "organic-signal": "Organic Signal",
};

const LEGACY_THEME_PRESET_IDS = new Map<string, ThemePresetId>(
  Object.entries(THEME_PRESET_DISPLAY_NAMES).map(([id, name]) => [name.toLowerCase(), id as ThemePresetId]),
);

export function isValidThemePresetId(value: unknown): value is ThemePresetId {
  return typeof value === "string" && THEME_PRESET_IDS.includes(value as ThemePresetId);
}

export function normalizeThemePresetId(value: unknown): ThemePresetId | null {
  if (isValidThemePresetId(value)) return value;
  if (typeof value !== "string") return null;
  return LEGACY_THEME_PRESET_IDS.get(value.trim().toLowerCase()) ?? null;
}

export function getThemePresetDisplayName(value: unknown): string {
  const id = normalizeThemePresetId(value);
  return id ? THEME_PRESET_DISPLAY_NAMES[id] : "Default Theme";
}
