"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type Theme = "dark" | "light" | "system";
export type AccentPreset = "violet" | "ocean" | "sunset" | "emerald" | "rose";
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
  ocean: { accent: "#0ea5e9", accentRgb: "14, 165, 233", accent2: "#2563eb" },
  sunset: { accent: "#f97316", accentRgb: "249, 115, 22", accent2: "#ef4444" },
  emerald: { accent: "#10b981", accentRgb: "16, 185, 129", accent2: "#06b6d4" },
  rose: { accent: "#e11d48", accentRgb: "225, 29, 72", accent2: "#f59e0b" },
};



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
