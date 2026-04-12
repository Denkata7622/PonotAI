"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type Theme = "dark" | "light" | "system";
export type AccentPreset =
  | "violet"
  | "indigo"
  | "blue"
  | "cyan"
  | "ocean"
  | "teal"
  | "emerald"
  | "lime"
  | "amber"
  | "gold"
  | "orange"
  | "sunset"
  | "coral"
  | "rose"
  | "ruby"
  | "magenta"
  | "plum"
  | "slate"
  | "graphite";
export type DensityMode = "comfortable" | "compact";

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  accent: AccentPreset;
  setAccent: (accent: AccentPreset) => void;
  density: DensityMode;
  setDensity: (density: DensityMode) => void;
};

const THEME_KEY = "ponotai-theme";
const ACCENT_KEY = "ponotai-accent";
const DENSITY_KEY = "ponotai-density";

export const ACCENT_TOKENS: Record<AccentPreset, { accent: string; accentRgb: string; accent2: string }> = {
  violet: { accent: "#7c5cff", accentRgb: "124, 92, 255", accent2: "#4cd3ff" },
  indigo: { accent: "#6366f1", accentRgb: "99, 102, 241", accent2: "#8b5cf6" },
  blue: { accent: "#3b82f6", accentRgb: "59, 130, 246", accent2: "#2563eb" },
  cyan: { accent: "#06b6d4", accentRgb: "6, 182, 212", accent2: "#0ea5e9" },
  ocean: { accent: "#0ea5e9", accentRgb: "14, 165, 233", accent2: "#2563eb" },
  teal: { accent: "#14b8a6", accentRgb: "20, 184, 166", accent2: "#0d9488" },
  sunset: { accent: "#f97316", accentRgb: "249, 115, 22", accent2: "#ef4444" },
  emerald: { accent: "#10b981", accentRgb: "16, 185, 129", accent2: "#06b6d4" },
  lime: { accent: "#84cc16", accentRgb: "132, 204, 22", accent2: "#65a30d" },
  amber: { accent: "#f59e0b", accentRgb: "245, 158, 11", accent2: "#d97706" },
  gold: { accent: "#eab308", accentRgb: "234, 179, 8", accent2: "#f59e0b" },
  orange: { accent: "#f97316", accentRgb: "249, 115, 22", accent2: "#fb7185" },
  coral: { accent: "#fb7185", accentRgb: "251, 113, 133", accent2: "#f97316" },
  rose: { accent: "#e11d48", accentRgb: "225, 29, 72", accent2: "#f59e0b" },
  ruby: { accent: "#be123c", accentRgb: "190, 18, 60", accent2: "#dc2626" },
  magenta: { accent: "#d946ef", accentRgb: "217, 70, 239", accent2: "#a855f7" },
  plum: { accent: "#9333ea", accentRgb: "147, 51, 234", accent2: "#7c3aed" },
  slate: { accent: "#64748b", accentRgb: "100, 116, 139", accent2: "#475569" },
  graphite: { accent: "#4b5563", accentRgb: "75, 85, 99", accent2: "#374151" },
};

export const THEME_TEMPLATES = {
  "Night Drive": { theme: "dark" as const, accent: "violet" as const, density: "compact" as const },
  "Ocean Pulse": { theme: "dark" as const, accent: "ocean" as const, density: "comfortable" as const },
  "Sunset Glow": { theme: "light" as const, accent: "sunset" as const, density: "comfortable" as const },
  "Forest Focus": { theme: "dark" as const, accent: "emerald" as const, density: "compact" as const },
  "Neon Violet": { theme: "dark" as const, accent: "magenta" as const, density: "compact" as const },
} as const;



function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme !== "system") return theme;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function applyAccentVariables(accent: AccentPreset): void {
  const tokens = ACCENT_TOKENS[accent];
  document.documentElement.setAttribute("data-accent", accent);
  document.documentElement.style.setProperty("--accent", tokens.accent);
  document.documentElement.style.setProperty("--accent-rgb", tokens.accentRgb);
  document.documentElement.style.setProperty("--accent-2", tokens.accent2);
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "dark";
    const savedTheme = window.localStorage.getItem(THEME_KEY);
    if (savedTheme === "dark" || savedTheme === "light" || savedTheme === "system") return savedTheme;
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  });

  const [accent, setAccent] = useState<AccentPreset>(() => {
    if (typeof window === "undefined") return "violet";
    const savedAccent = window.localStorage.getItem(ACCENT_KEY);
    if (savedAccent && savedAccent in ACCENT_TOKENS) return savedAccent as AccentPreset;
    return "violet";
  });

  const [density, setDensity] = useState<DensityMode>(() => {
    if (typeof window === "undefined") return "comfortable";
    return window.localStorage.getItem(DENSITY_KEY) === "compact" ? "compact" : "comfortable";
  });

  useEffect(() => {
    const resolvedTheme = resolveTheme(theme);
    document.documentElement.setAttribute("data-theme", resolvedTheme);
    document.body.setAttribute("data-theme", resolvedTheme);
    document.documentElement.style.colorScheme = resolvedTheme;
    window.localStorage.setItem(THEME_KEY, theme);

    if (theme === "system") {
      const media = window.matchMedia("(prefers-color-scheme: light)");
      const listener = () => {
        const next = media.matches ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", next);
        document.body.setAttribute("data-theme", next);
        document.documentElement.style.colorScheme = next;
      };
      media.addEventListener("change", listener);
      return () => media.removeEventListener("change", listener);
    }

    return undefined;
  }, [theme]);

  useEffect(() => {
    applyAccentVariables(accent);
    window.localStorage.setItem(ACCENT_KEY, accent);
  }, [accent]);

  useEffect(() => {
    document.documentElement.setAttribute("data-density", density);
    window.localStorage.setItem(DENSITY_KEY, density);
  }, [density]);

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      toggleTheme: () => setTheme((prev) => (prev === "dark" ? "light" : "dark")),
      accent,
      setAccent,
      density,
      setDensity,
    }),
    [accent, density, theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within a ThemeProvider");
  return context;
}


export const themeStorageKeys = { THEME_KEY, ACCENT_KEY, DENSITY_KEY };
export { applyAccentVariables, resolveTheme };
