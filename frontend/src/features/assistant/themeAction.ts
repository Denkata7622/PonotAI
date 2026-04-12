import type { AccentPreset, DensityMode } from "@/lib/ThemeContext";
import { isAccentPreset } from "@/lib/themePresets";

const SUPPORTED_DENSITY: DensityMode[] = ["comfortable", "compact"];

export function normalizeThemeActionPayload(payload: Record<string, unknown>): {
  theme?: "light" | "dark" | "system";
  accent?: AccentPreset;
  density?: DensityMode;
} {
  const theme = payload.theme;
  const accent = payload.accent;
  const density = payload.density;

  return {
    theme: theme === "light" || theme === "dark" || theme === "system" ? theme : undefined,
    accent: isAccentPreset(accent) ? accent : undefined,
    density: typeof density === "string" && SUPPORTED_DENSITY.includes(density as DensityMode) ? density as DensityMode : undefined,
  };
}
