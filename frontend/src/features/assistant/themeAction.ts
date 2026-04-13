import type { AccentPreset, DensityMode, SurfaceStyle, RadiusMode, SidebarStyle, MotionLevel, AccentIntensity, ChartStyle, UiPersonalization } from "@/lib/ThemeContext";
import { isAccentPreset } from "@/lib/themePresets";
import { isAssistantTemplateId, resolveTemplatePreset } from "./themeCatalog";

const SUPPORTED = {
  density: ["compact", "default", "comfortable"] as DensityMode[],
  surfaceStyle: ["flat", "soft", "elevated"] as SurfaceStyle[],
  radius: ["compact", "default", "rounded"] as RadiusMode[],
  sidebarStyle: ["standard", "tinted", "elevated"] as SidebarStyle[],
  motionLevel: ["full", "reduced", "minimal"] as MotionLevel[],
  intensity: ["subtle", "balanced", "vivid"] as AccentIntensity[],
  chartStyle: ["neutral", "accent-led", "multicolor"] as ChartStyle[],
};

export type NormalizedThemeAction = {
  theme?: "light" | "dark" | "system";
  accent?: AccentPreset;
  density?: DensityMode;
  surfaceStyle?: SurfaceStyle;
  radius?: RadiusMode;
  sidebarStyle?: SidebarStyle;
  motionLevel?: MotionLevel;
  intensity?: AccentIntensity;
  chartStyle?: ChartStyle;
  template?: string;
};

export function normalizeThemeActionPayload(payload: Record<string, unknown>): NormalizedThemeAction {
  const pick = <T extends string>(value: unknown, allowed: readonly T[]) => (typeof value === "string" && allowed.includes(value as T) ? value as T : undefined);

  const templateBase: Partial<UiPersonalization> = isAssistantTemplateId(payload.template)
    ? resolveTemplatePreset(payload.template)
    : {};

  return {
    theme: payload.theme === "light" || payload.theme === "dark" || payload.theme === "system"
      ? payload.theme
      : templateBase.theme,
    accent: isAccentPreset(payload.accent)
      ? payload.accent
      : templateBase.accent,
    density: pick(payload.density, SUPPORTED.density) ?? templateBase.density,
    surfaceStyle: pick(payload.surfaceStyle, SUPPORTED.surfaceStyle) ?? templateBase.surfaceStyle,
    radius: pick(payload.radius, SUPPORTED.radius) ?? templateBase.radius,
    sidebarStyle: pick(payload.sidebarStyle, SUPPORTED.sidebarStyle) ?? templateBase.sidebarStyle,
    motionLevel: pick(payload.motionLevel, SUPPORTED.motionLevel) ?? templateBase.motionLevel,
    intensity: pick(payload.intensity, SUPPORTED.intensity) ?? templateBase.intensity,
    chartStyle: pick(payload.chartStyle, SUPPORTED.chartStyle) ?? templateBase.chartStyle,
    template: isAssistantTemplateId(payload.template) ? payload.template : undefined,
  };
}

export function hasApplicableThemeChange(payload: NormalizedThemeAction): boolean {
  return Boolean(
    payload.theme
    || payload.accent
    || payload.density
    || payload.surfaceStyle
    || payload.radius
    || payload.sidebarStyle
    || payload.motionLevel
    || payload.intensity
    || payload.chartStyle,
  );
}
