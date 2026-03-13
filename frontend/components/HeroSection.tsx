"use client";

import { t, type Language } from "../lib/translations";

type HeroSectionProps = {
  language: Language;
  isListening: boolean;
  onRecognize: () => void;
  onOpenUpload: () => void;
  onToggleLanguage: () => void;
  onToggleTheme: () => void;
  onToggleLibrary: () => void;
  isLibraryOpen: boolean;
  theme: "dark" | "light";
};

export default function HeroSection({
  language,
  isListening,
  onRecognize,
  onOpenUpload,
  onToggleLanguage,
  onToggleTheme,
  onToggleLibrary,
  isLibraryOpen,
  theme,
}: HeroSectionProps) {
  return (
    <section className="relative overflow-hidden rounded-[28px] border border-border bg-surface p-6 sm:p-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(124,92,255,0.3),transparent_45%),radial-gradient(circle_at_80%_10%,rgba(76,211,255,0.2),transparent_40%)]" />
      <div className="relative">
        <div className="mb-8 flex flex-wrap items-center justify-end gap-2">
          <button aria-label={isLibraryOpen ? t("hide_library", language) : t("show_library", language)} className="glassBtn" onClick={onToggleLibrary}>{isLibraryOpen ? t("hide_library", language) : t("show_library", language)}</button>
          <button aria-label={t("language_label", language)} className="glassBtn" onClick={onToggleLanguage}>{language === "en" ? "🇧🇬 БГ" : "🇬🇧 EN"}</button>
          <button aria-label={theme === "dark" ? t("theme_light", language) : t("theme_dark", language)} className="glassBtn" onClick={onToggleTheme}>{theme === "dark" ? t("theme_light", language) : t("theme_dark", language)}</button>
        </div>

        <p className="text-center text-sm uppercase tracking-[0.28em] text-text-muted">{language === "bg" ? "ПонотИИ" : "PonotAI"}</p>
        <h1 className="mt-3 text-center text-4xl font-bold sm:text-5xl">{t("hero_tagline", language)}</h1>

        <div className="mt-10 flex flex-col items-center gap-5">
          <button
            onClick={onRecognize}
            className={`recognizeHeroButton ${isListening ? "recognizeHeroButtonListening" : ""}`}
            aria-label={t("btn_recognize_audio", language)}
          >
            <span className="text-4xl">{isListening ? "〰️" : "🎙️"}</span>
            <span className="mt-2 text-base font-semibold tracking-wide">{t("hero_title", language)}</span>
            {isListening && <span className="mt-1 text-xs text-text-muted">{t("recognizing_status", language)}</span>}
          </button>

          <button onClick={onOpenUpload} className="secondaryHeroAction">
            📷 {t("btn_upload_photo", language)}
          </button>
        </div>
      </div>
    </section>
  );
}
