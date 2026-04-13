export const SUPPORTED_ACCENTS = [
  "violet",
  "indigo",
  "blue",
  "cyan",
  "ocean",
  "teal",
  "emerald",
  "lime",
  "amber",
  "gold",
  "orange",
  "sunset",
  "coral",
  "rose",
  "ruby",
  "magenta",
  "plum",
  "slate",
  "graphite",
] as const;

export type AccentPreset = (typeof SUPPORTED_ACCENTS)[number];
export type AccentIntensity = "subtle" | "balanced" | "vivid";
export type ChartStyle = "neutral" | "accent-led" | "multicolor";

export type AccentTokenSet = {
  accent: string;
  accentRgb: string;
  accent2: string;
  accentForeground: string;
};

export const ACCENT_TOKENS: Record<AccentPreset, AccentTokenSet> = {
  violet: { accent: "#7c5cff", accentRgb: "124, 92, 255", accent2: "#4cd3ff", accentForeground: "#ffffff" },
  indigo: { accent: "#6366f1", accentRgb: "99, 102, 241", accent2: "#8b5cf6", accentForeground: "#ffffff" },
  blue: { accent: "#3b82f6", accentRgb: "59, 130, 246", accent2: "#2563eb", accentForeground: "#ffffff" },
  cyan: { accent: "#06b6d4", accentRgb: "6, 182, 212", accent2: "#0ea5e9", accentForeground: "#062a33" },
  ocean: { accent: "#0ea5e9", accentRgb: "14, 165, 233", accent2: "#2563eb", accentForeground: "#ffffff" },
  teal: { accent: "#14b8a6", accentRgb: "20, 184, 166", accent2: "#0d9488", accentForeground: "#062b26" },
  emerald: { accent: "#10b981", accentRgb: "16, 185, 129", accent2: "#06b6d4", accentForeground: "#06241a" },
  lime: { accent: "#84cc16", accentRgb: "132, 204, 22", accent2: "#65a30d", accentForeground: "#18230a" },
  amber: { accent: "#f59e0b", accentRgb: "245, 158, 11", accent2: "#d97706", accentForeground: "#2f1c06" },
  gold: { accent: "#eab308", accentRgb: "234, 179, 8", accent2: "#f59e0b", accentForeground: "#2f2408" },
  orange: { accent: "#f97316", accentRgb: "249, 115, 22", accent2: "#fb7185", accentForeground: "#2f1308" },
  sunset: { accent: "#f97316", accentRgb: "249, 115, 22", accent2: "#ef4444", accentForeground: "#2f1308" },
  coral: { accent: "#fb7185", accentRgb: "251, 113, 133", accent2: "#f97316", accentForeground: "#3b0f18" },
  rose: { accent: "#e11d48", accentRgb: "225, 29, 72", accent2: "#f59e0b", accentForeground: "#ffffff" },
  ruby: { accent: "#be123c", accentRgb: "190, 18, 60", accent2: "#dc2626", accentForeground: "#ffffff" },
  magenta: { accent: "#d946ef", accentRgb: "217, 70, 239", accent2: "#a855f7", accentForeground: "#2d0f34" },
  plum: { accent: "#9333ea", accentRgb: "147, 51, 234", accent2: "#7c3aed", accentForeground: "#ffffff" },
  slate: { accent: "#64748b", accentRgb: "100, 116, 139", accent2: "#475569", accentForeground: "#ffffff" },
  graphite: { accent: "#4b5563", accentRgb: "75, 85, 99", accent2: "#374151", accentForeground: "#ffffff" },
};

const intensityAlpha: Record<AccentIntensity, { soft: number; border: number; ring: number; hover: number; active: number }> = {
  subtle: { soft: 0.1, border: 0.3, ring: 0.26, hover: 0.15, active: 0.14 },
  balanced: { soft: 0.18, border: 0.5, ring: 0.35, hover: 0.24, active: 0.2 },
  vivid: { soft: 0.24, border: 0.66, ring: 0.48, hover: 0.34, active: 0.28 },
};

export function isAccentPreset(value: unknown): value is AccentPreset {
  return typeof value === "string" && SUPPORTED_ACCENTS.includes(value as AccentPreset);
}

export function normalizeAccentPreset(value: unknown, fallback: AccentPreset = "violet"): AccentPreset {
  return isAccentPreset(value) ? value : fallback;
}

export function getAccentCssVariables(accent: AccentPreset, intensity: AccentIntensity = "balanced", chartStyle: ChartStyle = "accent-led"): Record<string, string> {
  const token = ACCENT_TOKENS[accent];
  const alpha = intensityAlpha[intensity];
  const chartTokens =
    chartStyle === "neutral"
      ? ["#94a3b8", "#64748b", "#475569", "#334155", "#1e293b"]
      : chartStyle === "multicolor"
        ? [token.accent, token.accent2, "#22c55e", "#f59e0b", "#ef4444"]
        : [token.accent, token.accent2, `rgba(${token.accentRgb}, 0.75)`, `rgba(${token.accentRgb}, 0.58)`, `rgba(${token.accentRgb}, 0.42)`];
  const chartLabel = chartStyle === "neutral" ? "var(--muted)" : "color-mix(in srgb, var(--text) 82%, var(--chart-1))";

  return {
    "--accent": token.accent,
    "--accent-rgb": token.accentRgb,
    "--accent-2": token.accent2,
    "--accent-foreground": token.accentForeground,
    "--accent-soft": `rgba(${token.accentRgb}, ${alpha.soft})`,
    "--accent-border": `rgba(${token.accentRgb}, ${alpha.border})`,
    "--accent-ring": `rgba(${token.accentRgb}, ${alpha.ring})`,
    "--accent-hover": `rgba(${token.accentRgb}, ${alpha.hover})`,
    "--accent-active-bg": `rgba(${token.accentRgb}, ${alpha.active})`,
    "--listen-glow": `rgba(${token.accentRgb}, 0.55)`,
    "--listen-glow-soft": `rgba(${token.accentRgb}, ${Math.max(0.14, alpha.soft)})`,
    "--chart-1": chartTokens[0],
    "--chart-2": chartTokens[1],
    "--chart-3": chartTokens[2],
    "--chart-4": chartTokens[3],
    "--chart-5": chartTokens[4],
    "--chart-label": chartLabel,
  };
}
