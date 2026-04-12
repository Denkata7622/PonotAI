"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ACCENT_TOKENS as THEME_ACCENT_TOKENS, getAccentCssVariables, type AccentPreset, isAccentPreset } from "./themePresets";

type Theme = "dark" | "light" | "system";
export type DensityMode = "comfortable" | "compact";
export type { AccentPreset };

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

export const ACCENT_TOKENS = THEME_ACCENT_TOKENS;

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
  document.documentElement.setAttribute("data-accent", accent);
  const variables = getAccentCssVariables(accent);
  Object.entries(variables).forEach(([key, value]) => document.documentElement.style.setProperty(key, value));
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
    if (isAccentPreset(savedAccent)) return savedAccent;
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
