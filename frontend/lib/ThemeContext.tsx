"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  getAccentCssVariables,
  type AccentPreset,
  type AccentIntensity,
  type ChartStyle,
  isAccentPreset,
} from "./themePresets";
import { BODY_FONT_OPTIONS, DISPLAY_FONT_OPTIONS, DISPLAY_TEXT_STYLE_OPTIONS, TEXT_SCALE_OPTIONS } from "./typographyConfig";
import {
  ACCENT_TOKENS,
  DEFAULT_UI_PERSONALIZATION,
  THEME_PRESET_DEFINITIONS,
  THEME_PRESET_IDS,
  UI_PRESETS,
  findMatchingThemePresetId,
  getThemeDisplayName,
  getThemePresetById,
  getThemePreviewTokens,
  isValidThemePresetId,
  normalizeThemePresetId,
  type BodyFont,
  type CardEmphasis,
  type DensityMode,
  type DisplayFont,
  type DisplayTextStyle,
  type GlowLevel,
  type MotionLevel,
  type PanelTint,
  type RadiusMode,
  type SidebarStyle,
  type SurfaceStyle,
  type TextScale,
  type Theme,
  type ThemePresetDefinition,
  type ThemePresetId,
  type UiPersonalization,
} from "./themeRegistry";

export {
  ACCENT_TOKENS,
  DEFAULT_UI_PERSONALIZATION,
  THEME_PRESET_DEFINITIONS,
  THEME_PRESET_IDS,
  UI_PRESETS,
  findMatchingThemePresetId,
  getThemeDisplayName,
  getThemePresetById,
  getThemePreviewTokens,
  isValidThemePresetId,
  normalizeThemePresetId,
};

export type {
  AccentPreset,
  AccentIntensity,
  BodyFont,
  CardEmphasis,
  ChartStyle,
  DensityMode,
  DisplayFont,
  DisplayTextStyle,
  GlowLevel,
  MotionLevel,
  PanelTint,
  RadiusMode,
  SidebarStyle,
  SurfaceStyle,
  TextScale,
  Theme,
  ThemePresetDefinition,
  ThemePresetId,
  UiPersonalization,
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
  applyActivePersonalization: (patch: Partial<UiPersonalization>) => void;
  persistedUi: UiPersonalization;
  hasPreviewChanges: boolean;
  isComparingWithActiveTheme: boolean;
  setComparingWithActiveTheme: (value: boolean) => void;
  previewSession: ThemePreviewSession | null;
  isPreviewSessionActive: boolean;
  startPreviewSession: (origin: string, patch?: Partial<UiPersonalization>) => void;
  applyPreviewSession: () => void;
  discardPreviewSession: () => void;
  namedThemeDrafts: NamedThemeDraft[];
  isUiHydrated: boolean;
  saveNamedThemeDraft: (name: string) => { ok: boolean; reason?: "empty-name" };
  renameNamedThemeDraft: (id: string, name: string) => { ok: boolean; reason?: "empty-name" | "not-found" };
  deleteNamedThemeDraft: (id: string) => void;
  duplicateCurrentThemeAsDraft: (name?: string) => { ok: boolean; reason?: "empty-name" };
  applyNamedThemeDraft: (id: string) => void;
};

export type ThemePreviewSession = {
  active: true;
  origin: string;
  startedAt: string;
  previewThemePayload: UiPersonalization;
};

export type NamedThemeDraft = {
  id: string;
  name: string;
  savedAt: string;
  payload: UiPersonalization;
};

const STORAGE = {
  presetId: "ponotai-theme-preset-id",
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
  namedThemeDrafts: "ponotai-theme-named-drafts",
} as const;

const densityVars: Record<DensityMode, Record<string, string>> = {
  compact: { "--density-space-multiplier": "0.86", "--density-card-padding": "0.95rem", "--density-control-padding-y": "0.42rem", "--density-control-padding-x": "0.62rem" },
  default: { "--density-space-multiplier": "1", "--density-card-padding": "1.15rem", "--density-control-padding-y": "0.5rem", "--density-control-padding-x": "0.75rem" },
  comfortable: { "--density-space-multiplier": "1.12", "--density-card-padding": "1.35rem", "--density-control-padding-y": "0.64rem", "--density-control-padding-x": "0.92rem" },
};

const defaults = DEFAULT_UI_PERSONALIZATION;

function areUiPersonalizationsEqual(a: UiPersonalization, b: UiPersonalization): boolean {
  return (Object.keys(defaults) as Array<keyof UiPersonalization>).every((key) => a[key] === b[key]);
}

function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme !== "system") return theme;
  if (typeof window === "undefined") return "dark";
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

function readPersistedUiFromStorage(): UiPersonalization {
  if (typeof window === "undefined") return defaults;
  const savedTheme = window.localStorage.getItem(STORAGE.theme);
  const savedAccent = window.localStorage.getItem(STORAGE.accent);
  const legacyFont = window.localStorage.getItem(STORAGE.legacyFontFamily);
  const bodyFont = readAllowedValue(STORAGE.bodyFont, allowed.bodyFont, legacyToBodyFont(legacyFont));

  return {
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
  };
}

function readNamedThemeDraftsFromStorage(): NamedThemeDraft[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE.namedThemeDrafts) ?? "[]";
    const parsed = JSON.parse(raw) as NamedThemeDraft[];
    return Array.isArray(parsed) ? parsed.slice(0, 20) : [];
  } catch {
    return [];
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [persistedUi, setPersistedUi] = useState<UiPersonalization>(defaults);
  const [previewSession, setPreviewSession] = useState<ThemePreviewSession | null>(null);
  const [isComparingWithActiveTheme, setComparingWithActiveTheme] = useState(false);
  const [namedThemeDrafts, setNamedThemeDrafts] = useState<NamedThemeDraft[]>([]);
  const [isUiHydrated, setUiHydrated] = useState(false);
  const ui = previewSession?.previewThemePayload ?? persistedUi;
  const uiForDocument = previewSession && isComparingWithActiveTheme ? persistedUi : ui;
  const hasPreviewChanges = Boolean(previewSession && !areUiPersonalizationsEqual(previewSession.previewThemePayload, persistedUi));

  function updateUiSetting<K extends keyof UiPersonalization>(key: K, value: UiPersonalization[K]) {
    if (previewSession) {
      setPreviewSession((prev) => (prev ? { ...prev, previewThemePayload: { ...prev.previewThemePayload, [key]: value } } : prev));
      return;
    }
    setPersistedUi((prev) => ({ ...prev, [key]: value }));
  }

  const applyPersonalization = (patch: Partial<UiPersonalization>) => {
    if (previewSession) {
      setPreviewSession((prev) => (prev ? { ...prev, previewThemePayload: { ...prev.previewThemePayload, ...patch } } : prev));
      return;
    }
    setPersistedUi((prev) => ({ ...prev, ...patch }));
  };

  const applyActivePersonalization = (patch: Partial<UiPersonalization>) => {
    setPreviewSession(null);
    setComparingWithActiveTheme(false);
    setPersistedUi((prev) => ({ ...prev, ...patch }));
  };

  const startPreviewSession = (origin: string, patch?: Partial<UiPersonalization>) => {
    setPreviewSession({
      active: true,
      origin,
      startedAt: new Date().toISOString(),
      previewThemePayload: { ...persistedUi, ...(patch ?? {}) },
    });
  };

  const applyPreviewSession = () => {
    setPreviewSession((session) => {
      if (!session) return session;
      setPersistedUi(session.previewThemePayload);
      return null;
    });
  };

  const discardPreviewSession = () => {
    setPreviewSession(null);
    setComparingWithActiveTheme(false);
  };

  const saveNamedThemeDraft = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return { ok: false as const, reason: "empty-name" as const };
    const payload = previewSession?.previewThemePayload ?? persistedUi;
    setNamedThemeDrafts((prev) => {
      const draft: NamedThemeDraft = {
        id: `theme-draft-${Date.now()}`,
        name: trimmed,
        savedAt: new Date().toISOString(),
        payload,
      };
      const next = [draft, ...prev.filter((item) => item.name.toLowerCase() !== trimmed.toLowerCase())].slice(0, 20);
      window.localStorage.setItem(STORAGE.namedThemeDrafts, JSON.stringify(next));
      return next;
    });
    return { ok: true as const };
  };

  const renameNamedThemeDraft = (id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return { ok: false as const, reason: "empty-name" as const };
    let found = false;
    setNamedThemeDrafts((prev) => {
      const next = prev
        .map((item) => {
          if (item.id !== id) return item;
          found = true;
          return { ...item, name: trimmed };
        })
        .filter((item, index, arr) => arr.findIndex((entry) => entry.name.toLowerCase() === item.name.toLowerCase()) === index)
        .slice(0, 20);
      window.localStorage.setItem(STORAGE.namedThemeDrafts, JSON.stringify(next));
      return next;
    });
    if (!found) return { ok: false as const, reason: "not-found" as const };
    return { ok: true as const };
  };

  const deleteNamedThemeDraft = (id: string) => {
    setNamedThemeDrafts((prev) => {
      const next = prev.filter((item) => item.id !== id);
      window.localStorage.setItem(STORAGE.namedThemeDrafts, JSON.stringify(next));
      return next;
    });
  };

  const duplicateCurrentThemeAsDraft = (name?: string) => {
    const sourceName = name?.trim() || `Draft ${namedThemeDrafts.length + 1}`;
    return saveNamedThemeDraft(sourceName);
  };

  const applyNamedThemeDraft = (id: string) => {
    const selected = namedThemeDrafts.find((item) => item.id === id);
    if (!selected) return;
    if (!previewSession) {
      startPreviewSession("theme-draft", selected.payload);
      return;
    }
    setPreviewSession((prev) => (prev ? { ...prev, previewThemePayload: selected.payload } : prev));
  };

  useEffect(() => {
    setPersistedUi(readPersistedUiFromStorage());
    setNamedThemeDrafts(readNamedThemeDraftsFromStorage());
    setUiHydrated(true);
  }, []);

  useEffect(() => {
    if (!isUiHydrated) return;
    applyUiStateToDocument(uiForDocument);
  }, [isUiHydrated, uiForDocument]);

  useEffect(() => {
    if (!isUiHydrated) return;
    if (previewSession) return;
    window.localStorage.setItem(STORAGE.theme, persistedUi.theme);
    window.localStorage.setItem(STORAGE.accent, persistedUi.accent);
    window.localStorage.setItem(STORAGE.density, persistedUi.density);
    window.localStorage.setItem(STORAGE.intensity, persistedUi.intensity);
    window.localStorage.setItem(STORAGE.surfaceStyle, persistedUi.surfaceStyle);
    window.localStorage.setItem(STORAGE.radius, persistedUi.radius);
    window.localStorage.setItem(STORAGE.chartStyle, persistedUi.chartStyle);
    window.localStorage.setItem(STORAGE.sidebarStyle, persistedUi.sidebarStyle);
    window.localStorage.setItem(STORAGE.motionLevel, persistedUi.motionLevel);
    window.localStorage.setItem(STORAGE.cardEmphasis, persistedUi.cardEmphasis);
    window.localStorage.setItem(STORAGE.bodyFont, persistedUi.bodyFont);
    window.localStorage.setItem(STORAGE.displayFont, persistedUi.displayFont);
    window.localStorage.setItem(STORAGE.textScale, persistedUi.textScale);
    window.localStorage.setItem(STORAGE.glowLevel, persistedUi.glowLevel);
    window.localStorage.setItem(STORAGE.panelTint, persistedUi.panelTint);
    window.localStorage.setItem(STORAGE.displayTextStyle, persistedUi.displayTextStyle);

    if (persistedUi.theme === "system") {
      const media = window.matchMedia("(prefers-color-scheme: light)");
      const listener = () => applyUiStateToDocument(persistedUi);
      media.addEventListener("change", listener);
      return () => media.removeEventListener("change", listener);
    }
    return undefined;
  }, [isUiHydrated, persistedUi, previewSession]);

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
      applyActivePersonalization,
      persistedUi,
      hasPreviewChanges,
      isComparingWithActiveTheme,
      setComparingWithActiveTheme,
      previewSession,
      isPreviewSessionActive: Boolean(previewSession),
      startPreviewSession,
      applyPreviewSession,
      discardPreviewSession,
      namedThemeDrafts,
      isUiHydrated,
      saveNamedThemeDraft,
      renameNamedThemeDraft,
      deleteNamedThemeDraft,
      duplicateCurrentThemeAsDraft,
      applyNamedThemeDraft,
    }),
    [ui, persistedUi, hasPreviewChanges, isComparingWithActiveTheme, previewSession, namedThemeDrafts, isUiHydrated],
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
