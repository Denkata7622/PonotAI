export const SUPPORTED_THEMES = ["light", "dark", "system"] as const;
export const SUPPORTED_ACCENTS = [
  "violet", "indigo", "blue", "cyan", "ocean", "teal", "emerald", "lime", "amber", "gold",
  "orange", "sunset", "coral", "rose", "ruby", "magenta", "plum", "slate", "graphite",
] as const;
export const SUPPORTED_DENSITY = ["compact", "default", "comfortable"] as const;

export type ThemeMode = (typeof SUPPORTED_THEMES)[number];
export type AccentName = (typeof SUPPORTED_ACCENTS)[number];
export type DensityName = (typeof SUPPORTED_DENSITY)[number];

export type ThemeTemplate = {
  id: string;
  name: string;
  theme: Exclude<ThemeMode, "system">;
  accent: AccentName;
  density: DensityName;
  compatibility: "light-only" | "dark-only" | "both";
};

export const THEME_TEMPLATES: ThemeTemplate[] = [
  { id: "night-drive", name: "Night Drive", theme: "dark", accent: "violet", density: "compact", compatibility: "dark-only" },
  { id: "ocean-pulse", name: "Ocean Pulse", theme: "dark", accent: "ocean", density: "comfortable", compatibility: "dark-only" },
  { id: "sunset-glow", name: "Sunset Glow", theme: "light", accent: "sunset", density: "comfortable", compatibility: "light-only" },
  { id: "forest-focus", name: "Forest Focus", theme: "dark", accent: "emerald", density: "compact", compatibility: "dark-only" },
  { id: "neon-violet", name: "Neon Violet", theme: "dark", accent: "magenta", density: "compact", compatibility: "dark-only" },
] as const;

export const THEME_TEMPLATE_BY_ID = new Map(THEME_TEMPLATES.map((template) => [template.id, template]));

export function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === "string" && (SUPPORTED_THEMES as readonly string[]).includes(value);
}

export function isAccentName(value: unknown): value is AccentName {
  return typeof value === "string" && (SUPPORTED_ACCENTS as readonly string[]).includes(value);
}

export function isDensityName(value: unknown): value is DensityName {
  return typeof value === "string" && (SUPPORTED_DENSITY as readonly string[]).includes(value);
}

export function isTemplateId(value: unknown): value is string {
  return typeof value === "string" && THEME_TEMPLATE_BY_ID.has(value);
}
