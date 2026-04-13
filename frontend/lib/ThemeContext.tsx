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

type Theme = "dark" | "light" | "system";
export type DensityMode = "compact" | "default" | "comfortable";
export type RadiusMode = "compact" | "default" | "rounded";
export type SurfaceStyle = "flat" | "soft" | "elevated";
export type SidebarStyle = "standard" | "tinted" | "elevated";
export type MotionLevel = "full" | "reduced" | "minimal";

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
};

type ThemeContextValue = UiPersonalization & {
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
};

export const ACCENT_TOKENS = THEME_ACCENT_TOKENS;

export const UI_PRESETS: Record<string, UiPersonalization> = {
  "Clean Minimal": { ...defaults, theme: "light", accent: "slate", intensity: "subtle", surfaceStyle: "flat", density: "compact", radius: "compact", chartStyle: "neutral", sidebarStyle: "standard", motionLevel: "reduced" },
  "Neon Night": { ...defaults, theme: "dark", accent: "magenta", intensity: "vivid", surfaceStyle: "elevated", density: "compact", radius: "rounded", chartStyle: "multicolor", sidebarStyle: "elevated", motionLevel: "full" },
  "Ocean Studio": { ...defaults, theme: "dark", accent: "ocean", intensity: "balanced", surfaceStyle: "soft", density: "default", radius: "default", chartStyle: "accent-led", sidebarStyle: "tinted", motionLevel: "full" },
  "Sunset Warm": { ...defaults, theme: "light", accent: "sunset", intensity: "vivid", surfaceStyle: "soft", density: "comfortable", radius: "rounded", chartStyle: "multicolor", sidebarStyle: "tinted", motionLevel: "reduced" },
  "Forest Focus": { ...defaults, theme: "dark", accent: "emerald", intensity: "balanced", surfaceStyle: "flat", density: "compact", radius: "default", chartStyle: "accent-led", sidebarStyle: "standard", motionLevel: "minimal" },
  "Mono Pro": { ...defaults, theme: "dark", accent: "graphite", intensity: "subtle", surfaceStyle: "elevated", density: "default", radius: "compact", chartStyle: "neutral", sidebarStyle: "elevated", motionLevel: "minimal" },
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
  html.setAttribute("data-surface", state.surfaceStyle);
  html.setAttribute("data-sidebar", state.sidebarStyle);
  html.setAttribute("data-motion", state.motionLevel);

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
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [ui, setUi] = useState<UiPersonalization>(() => {
    if (typeof window === "undefined") return defaults;
    const savedTheme = window.localStorage.getItem(STORAGE.theme);
    const savedAccent = window.localStorage.getItem(STORAGE.accent);
    const saved = {
      theme: savedTheme === "dark" || savedTheme === "light" || savedTheme === "system" ? savedTheme : defaults.theme,
      accent: isAccentPreset(savedAccent) ? savedAccent : defaults.accent,
      density: allowed.density.includes(window.localStorage.getItem(STORAGE.density) as DensityMode) ? (window.localStorage.getItem(STORAGE.density) as DensityMode) : defaults.density,
      intensity: allowed.intensity.includes(window.localStorage.getItem(STORAGE.intensity) as AccentIntensity) ? (window.localStorage.getItem(STORAGE.intensity) as AccentIntensity) : defaults.intensity,
      surfaceStyle: allowed.surfaceStyle.includes(window.localStorage.getItem(STORAGE.surfaceStyle) as SurfaceStyle) ? (window.localStorage.getItem(STORAGE.surfaceStyle) as SurfaceStyle) : defaults.surfaceStyle,
      radius: allowed.radius.includes(window.localStorage.getItem(STORAGE.radius) as RadiusMode) ? (window.localStorage.getItem(STORAGE.radius) as RadiusMode) : defaults.radius,
      chartStyle: allowed.chartStyle.includes(window.localStorage.getItem(STORAGE.chartStyle) as ChartStyle) ? (window.localStorage.getItem(STORAGE.chartStyle) as ChartStyle) : defaults.chartStyle,
      sidebarStyle: allowed.sidebarStyle.includes(window.localStorage.getItem(STORAGE.sidebarStyle) as SidebarStyle) ? (window.localStorage.getItem(STORAGE.sidebarStyle) as SidebarStyle) : defaults.sidebarStyle,
      motionLevel: allowed.motionLevel.includes(window.localStorage.getItem(STORAGE.motionLevel) as MotionLevel) ? (window.localStorage.getItem(STORAGE.motionLevel) as MotionLevel) : defaults.motionLevel,
    } satisfies UiPersonalization;
    return saved;
  });

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
      setTheme: (theme: Theme) => applyPersonalization({ theme }),
      toggleTheme: () => applyPersonalization({ theme: resolveTheme(ui.theme) === "dark" ? "light" : "dark" }),
      setAccent: (accent: AccentPreset) => applyPersonalization({ accent }),
      setIntensity: (intensity: AccentIntensity) => applyPersonalization({ intensity }),
      setSurfaceStyle: (surfaceStyle: SurfaceStyle) => applyPersonalization({ surfaceStyle }),
      setDensity: (density: DensityMode) => applyPersonalization({ density }),
      setRadius: (radius: RadiusMode) => applyPersonalization({ radius }),
      setChartStyle: (chartStyle: ChartStyle) => applyPersonalization({ chartStyle }),
      setSidebarStyle: (sidebarStyle: SidebarStyle) => applyPersonalization({ sidebarStyle }),
      setMotionLevel: (motionLevel: MotionLevel) => applyPersonalization({ motionLevel }),
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
