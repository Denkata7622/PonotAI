"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ACCENT_TOKENS as THEME_ACCENT_TOKENS,
  getAccentCssVariables,
  type AccentPreset,
  type AccentIntensity,
  type ChartStyle,
  isAccentPreset,
} from "./themePresets";
import { BODY_FONT_OPTIONS, DISPLAY_FONT_OPTIONS, DISPLAY_TEXT_STYLE_OPTIONS, TEXT_SCALE_OPTIONS, type BodyFontOption, type DisplayFontOption, type DisplayTextStyleOption } from "./typographyConfig";

type Theme = "dark" | "light" | "system";
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

export type { AccentPreset, AccentIntensity, ChartStyle };

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

type ThemeContextValue = UiPersonalization & {
  updateUiSetting: <K extends keyof UiPersonalization>(key: K, value: UiPersonalization[K]) => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setAccent: (accent: AccentPreset) => void;
  setIntensity: (intensity: AccentIntensity) => void;
  setSurfaceStyle: (surfaceStyle: SurfaceStyle) => void;
  setDensity: (density: DensityMode) => void;
  setRadius: (radius: RadiusMode) => void;
  setChartStyle: (chartStyle: ChartStyle) => void;
  setSidebarStyle: (sidebarStyle: SidebarStyle) => void;
  setMotionLevel: (motionLevel: MotionLevel) => void;
  setCardEmphasis: (cardEmphasis: CardEmphasis) => void;
  setBodyFont: (bodyFont: BodyFont) => void;
  setDisplayFont: (displayFont: DisplayFont) => void;
  setTextScale: (textScale: TextScale) => void;
  setGlowLevel: (glowLevel: GlowLevel) => void;
  setPanelTint: (panelTint: PanelTint) => void;
  setDisplayTextStyle: (displayTextStyle: DisplayTextStyle) => void;
  applyPersonalization: (patch: Partial<UiPersonalization>) => void;
};

const STORAGE = {
  theme: "ponotai-theme",
  accent: "ponotai-accent",
  density: "ponotai-density",
  intensity: "ponotai-intensity",
  surfaceStyle: "ponotai-surface-style",
  radius: "ponotai-radius",
  chartStyle: "ponotai-chart-style",
  sidebarStyle: "ponotai-sidebar-style",
  motionLevel: "ponotai-motion-level",
  cardEmphasis: "ponotai-card-emphasis",
  bodyFont: "ponotai-body-font",
  displayFont: "ponotai-display-font",
  legacyFontFamily: "ponotai-font-family",
  textScale: "ponotai-text-scale",
  glowLevel: "ponotai-glow-level",
  panelTint: "ponotai-panel-tint",
  displayTextStyle: "ponotai-display-text-style",
} as const;

const densityVars: Record<DensityMode, Record<string, string>> = {
  compact: { "--density-space-multiplier": "0.86", "--density-card-padding": "0.95rem", "--density-control-padding-y": "0.42rem", "--density-control-padding-x": "0.62rem" },
  default: { "--density-space-multiplier": "1", "--density-card-padding": "1.15rem", "--density-control-padding-y": "0.5rem", "--density-control-padding-x": "0.75rem" },
  comfortable: { "--density-space-multiplier": "1.12", "--density-card-padding": "1.35rem", "--density-control-padding-y": "0.64rem", "--density-control-padding-x": "0.92rem" },
};

const defaults: UiPersonalization = {
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

export const ACCENT_TOKENS = THEME_ACCENT_TOKENS;

export const UI_PRESETS: Record<string, UiPersonalization> = {
  "Stock Clean": { ...defaults, theme: "light", accent: "slate", intensity: "subtle", surfaceStyle: "flat", radius: "default", density: "default", motionLevel: "reduced", bodyFont: "inter", displayFont: "space-grotesk", textScale: "md", displayTextStyle: "static" },
  "AI Minimal": { ...defaults, theme: "dark", accent: "graphite", intensity: "subtle", surfaceStyle: "soft", radius: "rounded", density: "compact", bodyFont: "manrope", displayFont: "sora", textScale: "sm", displayTextStyle: "slight-depth" },
  "Cyber Grid": { ...defaults, theme: "dark", accent: "ocean", intensity: "balanced", surfaceStyle: "elevated", radius: "compact", density: "compact", bodyFont: "ibm-plex-sans", displayFont: "orbitron", textScale: "sm", displayTextStyle: "subtle-glow" },
  "Neon Circuit": { ...defaults, theme: "dark", accent: "magenta", intensity: "vivid", surfaceStyle: "elevated", radius: "rounded", density: "compact", bodyFont: "outfit", displayFont: "oxanium", textScale: "md", displayTextStyle: "cyber-pulse" },
  "Urban Poster": { ...defaults, theme: "light", accent: "sunset", intensity: "vivid", surfaceStyle: "soft", radius: "compact", density: "comfortable", bodyFont: "dm-sans", displayFont: "archivo-black", textScale: "lg", displayTextStyle: "shadowed-poster" },
  "Velvet Script": { ...defaults, theme: "dark", accent: "ruby", intensity: "balanced", surfaceStyle: "soft", radius: "rounded", density: "comfortable", bodyFont: "nunito", displayFont: "marck-script", textScale: "lg", displayTextStyle: "soft-gradient" },
  "Steel Console": { ...defaults, theme: "dark", accent: "graphite", intensity: "subtle", surfaceStyle: "flat", radius: "default", density: "compact", bodyFont: "ibm-plex-sans", displayFont: "michroma", textScale: "sm", displayTextStyle: "slight-depth" },
  "Arcade Pulse": { ...defaults, theme: "dark", accent: "amber", intensity: "vivid", surfaceStyle: "soft", radius: "rounded", density: "default", bodyFont: "poppins", displayFont: "bungee", textScale: "md", displayTextStyle: "cyber-pulse" },
  "Noir Gothic": { ...defaults, theme: "dark", accent: "violet", intensity: "balanced", surfaceStyle: "soft", radius: "compact", density: "default", bodyFont: "plus-jakarta-sans", displayFont: "pirata-one", textScale: "md", displayTextStyle: "slight-depth" },
  "Organic Signal": { ...defaults, theme: "light", accent: "emerald", intensity: "balanced", surfaceStyle: "soft", radius: "rounded", density: "comfortable", bodyFont: "plus-jakarta-sans", displayFont: "kalam", textScale: "lg", displayTextStyle: "soft-gradient" },
};

function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme !== "system") return theme;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function applyUiStateToDocument(state: UiPersonalization): void {
  const html = document.documentElement;
  const resolvedTheme = resolveTheme(state.theme);
  html.setAttribute("data-theme", resolvedTheme);
  document.body.setAttribute("data-theme", resolvedTheme);
  html.style.colorScheme = resolvedTheme;
  html.setAttribute("data-accent", state.accent);
  html.setAttribute("data-density", state.density);
  html.setAttribute("data-radius", state.radius);
  html.setAttribute("data-chart-style", state.chartStyle);
  html.setAttribute("data-surface", state.surfaceStyle);
  html.setAttribute("data-sidebar", state.sidebarStyle);
  html.setAttribute("data-motion", state.motionLevel);
  html.setAttribute("data-card-emphasis", state.cardEmphasis);
  html.setAttribute("data-body-font", state.bodyFont);
  html.setAttribute("data-display-font", state.displayFont);
  html.setAttribute("data-text-scale", state.textScale);
  html.setAttribute("data-glow", state.glowLevel);
  html.setAttribute("data-panel-tint", state.panelTint);
  html.setAttribute("data-display-style", state.displayTextStyle);

  const variables = {
    ...getAccentCssVariables(state.accent, state.intensity, state.chartStyle),
    ...densityVars[state.density],
  };
  Object.entries(variables).forEach(([key, value]) => html.style.setProperty(key, value));
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const allowed = {
  intensity: ["subtle", "balanced", "vivid"] as AccentIntensity[],
  density: ["compact", "default", "comfortable"] as DensityMode[],
  radius: ["compact", "default", "rounded"] as RadiusMode[],
  surfaceStyle: ["flat", "soft", "elevated"] as SurfaceStyle[],
  chartStyle: ["neutral", "accent-led", "multicolor"] as ChartStyle[],
  sidebarStyle: ["standard", "tinted", "elevated"] as SidebarStyle[],
  motionLevel: ["full", "reduced", "minimal"] as MotionLevel[],
  cardEmphasis: ["standard", "accented", "tinted"] as CardEmphasis[],
  bodyFont: [...BODY_FONT_OPTIONS] as BodyFont[],
  displayFont: [...DISPLAY_FONT_OPTIONS] as DisplayFont[],
  textScale: [...TEXT_SCALE_OPTIONS] as TextScale[],
  glowLevel: ["off", "low", "medium"] as GlowLevel[],
  panelTint: ["off", "subtle", "rich"] as PanelTint[],
  displayTextStyle: [...DISPLAY_TEXT_STYLE_OPTIONS] as DisplayTextStyle[],
};

function readAllowedValue<T extends readonly string[]>(key: string, choices: T, fallback: T[number]) {
  const candidate = window.localStorage.getItem(key);
  return choices.includes(candidate as T[number]) ? (candidate as T[number]) : fallback;
}

function legacyToBodyFont(value: string | null): BodyFont {
  if (allowed.bodyFont.includes(value as BodyFont)) {
    return value as BodyFont;
  }
  return defaults.bodyFont;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [ui, setUi] = useState<UiPersonalization>(() => {
    if (typeof window === "undefined") return defaults;
    const savedTheme = window.localStorage.getItem(STORAGE.theme);
    const savedAccent = window.localStorage.getItem(STORAGE.accent);
    const legacyFont = window.localStorage.getItem(STORAGE.legacyFontFamily);
    const bodyFont = readAllowedValue(STORAGE.bodyFont, allowed.bodyFont, legacyToBodyFont(legacyFont));

    const saved = {
      theme: savedTheme === "dark" || savedTheme === "light" || savedTheme === "system" ? savedTheme : defaults.theme,
      accent: isAccentPreset(savedAccent) ? savedAccent : defaults.accent,
      density: readAllowedValue(STORAGE.density, allowed.density, defaults.density),
      intensity: readAllowedValue(STORAGE.intensity, allowed.intensity, defaults.intensity),
      surfaceStyle: readAllowedValue(STORAGE.surfaceStyle, allowed.surfaceStyle, defaults.surfaceStyle),
      radius: readAllowedValue(STORAGE.radius, allowed.radius, defaults.radius),
      chartStyle: readAllowedValue(STORAGE.chartStyle, allowed.chartStyle, defaults.chartStyle),
      sidebarStyle: readAllowedValue(STORAGE.sidebarStyle, allowed.sidebarStyle, defaults.sidebarStyle),
      motionLevel: readAllowedValue(STORAGE.motionLevel, allowed.motionLevel, defaults.motionLevel),
      cardEmphasis: readAllowedValue(STORAGE.cardEmphasis, allowed.cardEmphasis, defaults.cardEmphasis),
      bodyFont,
      displayFont: readAllowedValue(STORAGE.displayFont, allowed.displayFont, defaults.displayFont),
      textScale: readAllowedValue(STORAGE.textScale, allowed.textScale, defaults.textScale),
      glowLevel: readAllowedValue(STORAGE.glowLevel, allowed.glowLevel, defaults.glowLevel),
      panelTint: readAllowedValue(STORAGE.panelTint, allowed.panelTint, defaults.panelTint),
      displayTextStyle: readAllowedValue(STORAGE.displayTextStyle, allowed.displayTextStyle, defaults.displayTextStyle),
    } satisfies UiPersonalization;
    return saved;
  });

  function updateUiSetting<K extends keyof UiPersonalization>(key: K, value: UiPersonalization[K]) {
    setUi((prev) => ({ ...prev, [key]: value }));
  }

  const applyPersonalization = (patch: Partial<UiPersonalization>) => {
    setUi((prev) => ({ ...prev, ...patch }));
  };

  useEffect(() => {
    applyUiStateToDocument(ui);
    window.localStorage.setItem(STORAGE.theme, ui.theme);
    window.localStorage.setItem(STORAGE.accent, ui.accent);
    window.localStorage.setItem(STORAGE.density, ui.density);
    window.localStorage.setItem(STORAGE.intensity, ui.intensity);
    window.localStorage.setItem(STORAGE.surfaceStyle, ui.surfaceStyle);
    window.localStorage.setItem(STORAGE.radius, ui.radius);
    window.localStorage.setItem(STORAGE.chartStyle, ui.chartStyle);
    window.localStorage.setItem(STORAGE.sidebarStyle, ui.sidebarStyle);
    window.localStorage.setItem(STORAGE.motionLevel, ui.motionLevel);
    window.localStorage.setItem(STORAGE.cardEmphasis, ui.cardEmphasis);
    window.localStorage.setItem(STORAGE.bodyFont, ui.bodyFont);
    window.localStorage.setItem(STORAGE.displayFont, ui.displayFont);
    window.localStorage.setItem(STORAGE.textScale, ui.textScale);
    window.localStorage.setItem(STORAGE.glowLevel, ui.glowLevel);
    window.localStorage.setItem(STORAGE.panelTint, ui.panelTint);
    window.localStorage.setItem(STORAGE.displayTextStyle, ui.displayTextStyle);

    if (ui.theme === "system") {
      const media = window.matchMedia("(prefers-color-scheme: light)");
      const listener = () => applyUiStateToDocument(ui);
      media.addEventListener("change", listener);
      return () => media.removeEventListener("change", listener);
    }
    return undefined;
  }, [ui]);

  const value = useMemo(
    () => ({
      ...ui,
      updateUiSetting,
      setTheme: (theme: Theme) => updateUiSetting("theme", theme),
      toggleTheme: () => updateUiSetting("theme", resolveTheme(ui.theme) === "dark" ? "light" : "dark"),
      setAccent: (accent: AccentPreset) => updateUiSetting("accent", accent),
      setIntensity: (intensity: AccentIntensity) => updateUiSetting("intensity", intensity),
      setSurfaceStyle: (surfaceStyle: SurfaceStyle) => updateUiSetting("surfaceStyle", surfaceStyle),
      setDensity: (density: DensityMode) => updateUiSetting("density", density),
      setRadius: (radius: RadiusMode) => updateUiSetting("radius", radius),
      setChartStyle: (chartStyle: ChartStyle) => updateUiSetting("chartStyle", chartStyle),
      setSidebarStyle: (sidebarStyle: SidebarStyle) => updateUiSetting("sidebarStyle", sidebarStyle),
      setMotionLevel: (motionLevel: MotionLevel) => updateUiSetting("motionLevel", motionLevel),
      setCardEmphasis: (cardEmphasis: CardEmphasis) => updateUiSetting("cardEmphasis", cardEmphasis),
      setBodyFont: (bodyFont: BodyFont) => updateUiSetting("bodyFont", bodyFont),
      setDisplayFont: (displayFont: DisplayFont) => updateUiSetting("displayFont", displayFont),
      setTextScale: (textScale: TextScale) => updateUiSetting("textScale", textScale),
      setGlowLevel: (glowLevel: GlowLevel) => updateUiSetting("glowLevel", glowLevel),
      setPanelTint: (panelTint: PanelTint) => updateUiSetting("panelTint", panelTint),
      setDisplayTextStyle: (displayTextStyle: DisplayTextStyle) => updateUiSetting("displayTextStyle", displayTextStyle),
      applyPersonalization,
    }),
    [ui],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within a ThemeProvider");
  return context;
}

function applyAccentVariables(accent: AccentPreset, intensity: AccentIntensity = "balanced", chartStyle: ChartStyle = "accent-led") {
  const html = document.documentElement;
  const variables = getAccentCssVariables(accent, intensity, chartStyle);
  html.setAttribute("data-accent", accent);
  Object.entries(variables).forEach(([key, value]) => html.style.setProperty(key, value));
}

export const themeStorageKeys = STORAGE;
export { applyAccentVariables, resolveTheme };
