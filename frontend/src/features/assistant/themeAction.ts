import type { AccentPreset, DensityMode, SurfaceStyle, RadiusMode, SidebarStyle, MotionLevel, AccentIntensity, ChartStyle } from "@/lib/ThemeContext";
import { isAccentPreset } from "@/lib/themePresets";

const SUPPORTED = {
  density: ["compact", "default", "comfortable"] as DensityMode[],
  surfaceStyle: ["flat", "soft", "elevated"] as SurfaceStyle[],
  radius: ["compact", "default", "rounded"] as RadiusMode[],
  sidebarStyle: ["standard", "tinted", "elevated"] as SidebarStyle[],
  motionLevel: ["full", "reduced", "minimal"] as MotionLevel[],
  intensity: ["subtle", "balanced", "vivid"] as AccentIntensity[],
  chartStyle: ["neutral", "accent-led", "multicolor"] as ChartStyle[],
};

export function normalizeThemeActionPayload(payload: Record<string, unknown>): {
  theme?: "light" | "dark" | "system";
  accent?: AccentPreset;
  density?: DensityMode;
  surfaceStyle?: SurfaceStyle;
  radius?: RadiusMode;
  sidebarStyle?: SidebarStyle;
  motionLevel?: MotionLevel;
  intensity?: AccentIntensity;
  chartStyle?: ChartStyle;
} {
  const pick = <T extends string>(value: unknown, allowed: readonly T[]) => (typeof value === "string" && allowed.includes(value as T) ? value as T : undefined);

  return {
    theme: payload.theme === "light" || payload.theme === "dark" || payload.theme === "system" ? payload.theme : undefined,
    accent: isAccentPreset(payload.accent) ? payload.accent : undefined,
    density: pick(payload.density, SUPPORTED.density),
    surfaceStyle: pick(payload.surfaceStyle, SUPPORTED.surfaceStyle),
    radius: pick(payload.radius, SUPPORTED.radius),
    sidebarStyle: pick(payload.sidebarStyle, SUPPORTED.sidebarStyle),
    motionLevel: pick(payload.motionLevel, SUPPORTED.motionLevel),
    intensity: pick(payload.intensity, SUPPORTED.intensity),
    chartStyle: pick(payload.chartStyle, SUPPORTED.chartStyle),
  };
}
