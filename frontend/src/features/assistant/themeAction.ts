import type { AccentPreset, DensityMode } from "@/lib/ThemeContext";

const SUPPORTED_ACCENTS: AccentPreset[] = ["violet", "indigo", "blue", "cyan", "ocean", "teal", "emerald", "lime", "amber", "gold", "orange", "sunset", "coral", "rose", "ruby", "magenta", "plum", "slate", "graphite"];
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
    accent: typeof accent === "string" && SUPPORTED_ACCENTS.includes(accent as AccentPreset) ? accent as AccentPreset : undefined,
    density: typeof density === "string" && SUPPORTED_DENSITY.includes(density as DensityMode) ? density as DensityMode : undefined,
  };
}
