export const SUPPORTED_THEMES = ["light", "dark", "system"] as const;
export const SUPPORTED_ACCENTS = [
  "violet", "indigo", "blue", "cyan", "ocean", "teal", "emerald", "lime", "amber", "gold",
  "orange", "sunset", "coral", "rose", "ruby", "magenta", "plum", "slate", "graphite",
] as const;
export const SUPPORTED_DENSITY = ["compact", "default", "comfortable"] as const;
export const SUPPORTED_PANEL_TINT = ["off", "subtle", "rich"] as const;
export const SUPPORTED_SURFACE_STYLE = ["flat", "soft", "elevated"] as const;
export const SUPPORTED_TEXT_SCALE = ["sm", "md", "lg"] as const;
export const SUPPORTED_DISPLAY_TEXT_STYLE = ["static", "soft-gradient", "subtle-glow", "slight-depth", "cyber-pulse", "shadowed-poster"] as const;
export const SUPPORTED_BODY_FONTS = ["inter", "system", "poppins", "nunito", "ibm-plex-sans", "manrope", "dm-sans", "plus-jakarta-sans", "outfit", "sora", "space-grotesk", "orbitron", "audiowide", "rajdhani", "exo-2", "oxanium", "chakra-petch", "russo-one", "michroma", "pirata-one", "unifraktur-cook", "yatra-one", "kalam", "marck-script", "bungee", "bungee-shade", "monoton", "black-ops-one", "archivo-black"] as const;
export const SUPPORTED_DISPLAY_FONTS = ["manrope", "outfit", "sora", "space-grotesk", "orbitron", "audiowide", "rajdhani", "exo-2", "oxanium", "chakra-petch", "russo-one", "michroma", "pirata-one", "unifraktur-cook", "yatra-one", "kalam", "marck-script", "bungee", "bungee-shade", "monoton", "black-ops-one", "archivo-black"] as const;

export type ThemeMode = (typeof SUPPORTED_THEMES)[number];
export type AccentName = (typeof SUPPORTED_ACCENTS)[number];
export type DensityName = (typeof SUPPORTED_DENSITY)[number];
export type PanelTintName = (typeof SUPPORTED_PANEL_TINT)[number];
export type SurfaceStyleName = (typeof SUPPORTED_SURFACE_STYLE)[number];
export type TextScaleName = (typeof SUPPORTED_TEXT_SCALE)[number];
export type DisplayTextStyleName = (typeof SUPPORTED_DISPLAY_TEXT_STYLE)[number];
export type BodyFontName = (typeof SUPPORTED_BODY_FONTS)[number];
export type DisplayFontName = (typeof SUPPORTED_DISPLAY_FONTS)[number];

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

export function isPanelTintName(value: unknown): value is PanelTintName {
  return typeof value === "string" && (SUPPORTED_PANEL_TINT as readonly string[]).includes(value);
}

export function isSurfaceStyleName(value: unknown): value is SurfaceStyleName {
  return typeof value === "string" && (SUPPORTED_SURFACE_STYLE as readonly string[]).includes(value);
}

export function isTextScaleName(value: unknown): value is TextScaleName {
  return typeof value === "string" && (SUPPORTED_TEXT_SCALE as readonly string[]).includes(value);
}

export function isDisplayTextStyleName(value: unknown): value is DisplayTextStyleName {
  return typeof value === "string" && (SUPPORTED_DISPLAY_TEXT_STYLE as readonly string[]).includes(value);
}

export function isBodyFontName(value: unknown): value is BodyFontName {
  return typeof value === "string" && (SUPPORTED_BODY_FONTS as readonly string[]).includes(value);
}

export function isDisplayFontName(value: unknown): value is DisplayFontName {
  return typeof value === "string" && (SUPPORTED_DISPLAY_FONTS as readonly string[]).includes(value);
}
