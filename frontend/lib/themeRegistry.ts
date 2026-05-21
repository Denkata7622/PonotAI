import {
  ACCENT_TOKENS,
  getAccentCssVariables,
  type AccentIntensity,
  type AccentPreset,
  type ChartStyle,
} from "./themePresets";
import {
  type BodyFontOption,
  type DisplayFontOption,
  type DisplayTextStyleOption,
} from "./typographyConfig";

export { ACCENT_TOKENS };

export type Theme = "dark" | "light" | "system";
export type DensityMode = "compact" | "default" | "comfortable";
export type RadiusMode = "compact" | "default" | "rounded";
export type SurfaceStyle = "flat" | "soft" | "elevated";
export type SidebarStyle = "standard" | "tinted" | "elevated";
export type MotionLevel = "full" | "reduced" | "minimal";
export type CardEmphasis = "standard" | "accented" | "tinted";
export type BodyFont = BodyFontOption;
export type DisplayFont = DisplayFontOption;
export type TextScale = "sm" | "md" | "lg";
export type GlowLevel = "off" | "low" | "medium";
export type PanelTint = "off" | "subtle" | "rich";
export type DisplayTextStyle = DisplayTextStyleOption;

export type UiPersonalization = {
  theme: Theme;
  accent: AccentPreset;
  intensity: AccentIntensity;
  surfaceStyle: SurfaceStyle;
  density: DensityMode;
  radius: RadiusMode;
  chartStyle: ChartStyle;
  sidebarStyle: SidebarStyle;
  motionLevel: MotionLevel;
  cardEmphasis: CardEmphasis;
  bodyFont: BodyFont;
  displayFont: DisplayFont;
  textScale: TextScale;
  glowLevel: GlowLevel;
  panelTint: PanelTint;
  displayTextStyle: DisplayTextStyle;
};

export type ThemePresetDefinition = {
  id: string;
  name: string;
  category: "Classic" | "Minimal" | "Cyber" | "Expressive" | "Console" | "Organic";
  description: string;
  personalization: UiPersonalization;
};

export const DEFAULT_UI_PERSONALIZATION: UiPersonalization = {
  theme: "dark",
  accent: "violet",
  intensity: "balanced",
  surfaceStyle: "soft",
  density: "default",
  radius: "default",
  chartStyle: "accent-led",
  sidebarStyle: "standard",
  motionLevel: "full",
  cardEmphasis: "standard",
  bodyFont: "inter",
  displayFont: "space-grotesk",
  textScale: "md",
  glowLevel: "low",
  panelTint: "subtle",
  displayTextStyle: "static",
};

const defaults = DEFAULT_UI_PERSONALIZATION;

export const THEME_PRESET_DEFINITIONS = [
  {
    id: "stock-clean",
    name: "Stock Clean",
    category: "Classic",
    description: "Light, flat surfaces with a restrained slate accent.",
    personalization: { ...defaults, theme: "light", accent: "slate", intensity: "subtle", surfaceStyle: "flat", radius: "default", density: "default", motionLevel: "reduced", bodyFont: "inter", displayFont: "space-grotesk", textScale: "md", displayTextStyle: "static" },
  },
  {
    id: "ai-minimal",
    name: "AI Minimal",
    category: "Minimal",
    description: "Compact dark surfaces with graphite controls and quiet depth.",
    personalization: { ...defaults, theme: "dark", accent: "graphite", intensity: "subtle", surfaceStyle: "soft", radius: "rounded", density: "compact", bodyFont: "manrope", displayFont: "sora", textScale: "sm", displayTextStyle: "slight-depth" },
  },
  {
    id: "cyber-grid",
    name: "Cyber Grid",
    category: "Cyber",
    description: "Elevated dark panels with ocean accents and technical type.",
    personalization: { ...defaults, theme: "dark", accent: "ocean", intensity: "balanced", surfaceStyle: "elevated", radius: "compact", density: "compact", bodyFont: "ibm-plex-sans", displayFont: "orbitron", textScale: "sm", displayTextStyle: "subtle-glow" },
  },
  {
    id: "neon-circuit",
    name: "Neon Circuit",
    category: "Cyber",
    description: "Vivid magenta circuitry with rounded elevated panels.",
    personalization: { ...defaults, theme: "dark", accent: "magenta", intensity: "vivid", surfaceStyle: "elevated", radius: "rounded", density: "compact", bodyFont: "outfit", displayFont: "oxanium", textScale: "md", displayTextStyle: "cyber-pulse" },
  },
  {
    id: "urban-poster",
    name: "Urban Poster",
    category: "Expressive",
    description: "Light poster styling with sunset accents and larger type.",
    personalization: { ...defaults, theme: "light", accent: "sunset", intensity: "vivid", surfaceStyle: "soft", radius: "compact", density: "comfortable", bodyFont: "dm-sans", displayFont: "archivo-black", textScale: "lg", displayTextStyle: "shadowed-poster" },
  },
  {
    id: "velvet-script",
    name: "Velvet Script",
    category: "Expressive",
    description: "Dark ruby styling with soft surfaces and script display text.",
    personalization: { ...defaults, theme: "dark", accent: "ruby", intensity: "balanced", surfaceStyle: "soft", radius: "rounded", density: "comfortable", bodyFont: "nunito", displayFont: "marck-script", textScale: "lg", displayTextStyle: "soft-gradient" },
  },
  {
    id: "steel-console",
    name: "Steel Console",
    category: "Console",
    description: "Flat dark console surfaces with graphite controls.",
    personalization: { ...defaults, theme: "dark", accent: "graphite", intensity: "subtle", surfaceStyle: "flat", radius: "default", density: "compact", bodyFont: "ibm-plex-sans", displayFont: "michroma", textScale: "sm", displayTextStyle: "slight-depth" },
  },
  {
    id: "arcade-pulse",
    name: "Arcade Pulse",
    category: "Expressive",
    description: "Dark arcade styling with vivid amber action color.",
    personalization: { ...defaults, theme: "dark", accent: "amber", intensity: "vivid", surfaceStyle: "soft", radius: "rounded", density: "default", bodyFont: "poppins", displayFont: "bungee", textScale: "md", displayTextStyle: "cyber-pulse" },
  },
  {
    id: "noir-gothic",
    name: "Noir Gothic",
    category: "Expressive",
    description: "Compact dark gothic direction with violet accents.",
    personalization: { ...defaults, theme: "dark", accent: "violet", intensity: "balanced", surfaceStyle: "soft", radius: "compact", density: "default", bodyFont: "plus-jakarta-sans", displayFont: "pirata-one", textScale: "md", displayTextStyle: "slight-depth" },
  },
  {
    id: "organic-signal",
    name: "Organic Signal",
    category: "Organic",
    description: "Light organic styling with emerald accents and warm spacing.",
    personalization: { ...defaults, theme: "light", accent: "emerald", intensity: "balanced", surfaceStyle: "soft", radius: "rounded", density: "comfortable", bodyFont: "plus-jakarta-sans", displayFont: "kalam", textScale: "lg", displayTextStyle: "soft-gradient" },
  },
] as const satisfies readonly ThemePresetDefinition[];

export type ThemePresetId = (typeof THEME_PRESET_DEFINITIONS)[number]["id"];
export const THEME_PRESET_IDS = THEME_PRESET_DEFINITIONS.map((preset) => preset.id) as ThemePresetId[];

const PRESET_BY_ID = new Map<string, ThemePresetDefinition>(THEME_PRESET_DEFINITIONS.map((preset) => [preset.id, preset]));
const LEGACY_PRESET_IDS = new Map<string, ThemePresetId>(
  THEME_PRESET_DEFINITIONS.map((preset) => [preset.name.toLowerCase(), preset.id as ThemePresetId]),
);

export const UI_PRESETS = Object.fromEntries(
  THEME_PRESET_DEFINITIONS.map((preset) => [preset.id, preset.personalization]),
) as Record<ThemePresetId, UiPersonalization>;

export function isValidThemePresetId(value: unknown): value is ThemePresetId {
  return typeof value === "string" && PRESET_BY_ID.has(value);
}

export function normalizeThemePresetId(value: unknown): ThemePresetId | null {
  if (isValidThemePresetId(value)) return value;
  if (typeof value !== "string") return null;
  return LEGACY_PRESET_IDS.get(value.trim().toLowerCase()) ?? null;
}

export function getThemePresetById(value: unknown): ThemePresetDefinition | null {
  const id = normalizeThemePresetId(value);
  return id ? PRESET_BY_ID.get(id) ?? null : null;
}

export function getThemeDisplayName(value: unknown): string {
  return getThemePresetById(value)?.name ?? "Default Theme";
}

function areUiPersonalizationsEqual(a: UiPersonalization, b: UiPersonalization): boolean {
  return (Object.keys(defaults) as Array<keyof UiPersonalization>).every((key) => a[key] === b[key]);
}

export function findMatchingThemePresetId(ui: UiPersonalization): ThemePresetId | null {
  return THEME_PRESET_DEFINITIONS.find((preset) => areUiPersonalizationsEqual(preset.personalization, ui))?.id ?? null;
}

type BasePreviewTokens = {
  background: string;
  backgroundAlt: string;
  surface: string;
  surfaceSubtle: string;
  surfaceElevated: string;
  border: string;
  text: string;
  muted: string;
};

const basePreviewTokens: Record<"dark" | "light", BasePreviewTokens> = {
  dark: {
    background: "#0b0d12",
    backgroundAlt: "#07080c",
    surface: "rgba(255, 255, 255, 0.05)",
    surfaceSubtle: "rgba(255, 255, 255, 0.04)",
    surfaceElevated: "rgba(255, 255, 255, 0.14)",
    border: "rgba(255, 255, 255, 0.1)",
    text: "rgba(255, 255, 255, 0.92)",
    muted: "rgba(255, 255, 255, 0.62)",
  },
  light: {
    background: "#f5f7fa",
    backgroundAlt: "#e9eef7",
    surface: "rgba(255, 255, 255, 0.8)",
    surfaceSubtle: "rgba(255, 255, 255, 0.62)",
    surfaceElevated: "rgba(255, 255, 255, 0.96)",
    border: "rgba(0, 0, 0, 0.1)",
    text: "rgba(0, 0, 0, 0.87)",
    muted: "rgba(0, 0, 0, 0.62)",
  },
};

export function getThemePreviewTokens(preset: ThemePresetDefinition | UiPersonalization | ThemePresetId) {
  const personalization = typeof preset === "string"
    ? getThemePresetById(preset)?.personalization ?? defaults
    : "personalization" in preset
      ? preset.personalization
      : preset;
  const resolved = personalization.theme === "light" ? "light" : "dark";
  const base = basePreviewTokens[resolved];
  const accent = ACCENT_TOKENS[personalization.accent];
  const accentVariables = getAccentCssVariables(personalization.accent, personalization.intensity, personalization.chartStyle);
  const surfaceSubtle = personalization.surfaceStyle === "flat"
    ? `color-mix(in srgb, ${base.surface} 97%, transparent)`
    : personalization.surfaceStyle === "elevated"
      ? `color-mix(in srgb, ${base.surface} 78%, ${resolved === "dark" ? "black" : "white"} 22%)`
      : `color-mix(in srgb, ${base.surface} 88%, transparent)`;
  const surfaceElevated = personalization.surfaceStyle === "flat"
    ? base.surface
    : personalization.surfaceStyle === "elevated"
      ? `color-mix(in srgb, ${base.surface} 64%, white 36%)`
      : `color-mix(in srgb, ${base.surface} 86%, white 14%)`;

  return {
    ...base,
    surfaceSubtle,
    surfaceElevated,
    accent: accent.accent,
    accent2: accent.accent2,
    accentForeground: accent.accentForeground,
    accentSoft: accentVariables["--accent-soft"],
    accentBorder: accentVariables["--accent-border"],
    accentRing: accentVariables["--accent-ring"],
  };
}
