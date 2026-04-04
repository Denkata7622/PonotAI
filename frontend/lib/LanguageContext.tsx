"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { Language } from "./translations";

type LanguageContextValue = {
  language: Language;
  setLanguage: (lang: Language) => void;
  setLocale: (lang: Language) => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    if (typeof window === "undefined") return "bg";
    const saved = window.localStorage.getItem("ponotai-language");
    return saved === "en" || saved === "bg" ? saved : "bg";
  });

  const setLocale = (lang: Language) => {
    setLanguage(lang);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("ponotai-language", lang);
    }
  };

  return <LanguageContext.Provider value={{ language, setLanguage: setLocale, setLocale }}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  return context;
}
