import type {
  AccentPreset,
  DensityMode,
  SurfaceStyle,
  RadiusMode,
  SidebarStyle,
  MotionLevel,
  AccentIntensity,
  ChartStyle,
  UiPersonalization,
  BodyFont,
  DisplayFont,
  TextScale,
  PanelTint,
  DisplayTextStyle,
} from "@/lib/ThemeContext";
import { BODY_FONT_OPTIONS, DISPLAY_FONT_OPTIONS, DISPLAY_TEXT_STYLE_OPTIONS, TEXT_SCALE_OPTIONS } from "@/lib/typographyConfig";
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
  panelTint: ["off", "subtle", "rich"] as PanelTint[],
  bodyFont: [...BODY_FONT_OPTIONS] as BodyFont[],
  displayFont: [...DISPLAY_FONT_OPTIONS] as DisplayFont[],
  textScale: [...TEXT_SCALE_OPTIONS] as TextScale[],
  displayTextStyle: [...DISPLAY_TEXT_STYLE_OPTIONS] as DisplayTextStyle[],
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
  panelTint?: PanelTint;
  bodyFont?: BodyFont;
  displayFont?: DisplayFont;
  textScale?: TextScale;
  displayTextStyle?: DisplayTextStyle;
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
    panelTint: pick(payload.panelTint, SUPPORTED.panelTint) ?? templateBase.panelTint,
    bodyFont: pick(payload.bodyFont, SUPPORTED.bodyFont) ?? templateBase.bodyFont,
    displayFont: pick(payload.displayFont, SUPPORTED.displayFont) ?? templateBase.displayFont,
    textScale: pick(payload.textScale, SUPPORTED.textScale) ?? templateBase.textScale,
    displayTextStyle: pick(payload.displayTextStyle, SUPPORTED.displayTextStyle) ?? templateBase.displayTextStyle,
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
    || payload.chartStyle
    || payload.panelTint
    || payload.bodyFont
    || payload.displayFont
    || payload.textScale
    || payload.displayTextStyle
  );
}
