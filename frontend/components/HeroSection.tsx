"use client";

import { Camera, Mic, Radio } from "./icons";
import { useEffect, useRef, useState } from "react";
import { t, type Language } from "../lib/translations";
import { Button } from "../src/components/ui/Button";

type HeroSectionProps = {
  language: Language;
  isListening: boolean;
  preparingCountdown: number | null;
  microphoneStream: MediaStream | null;
  onRecognize: () => void;
  onOpenUpload: () => void;
  onToggleLanguage: () => void;
  onToggleTheme: () => void;
  onToggleLibrary: () => void;
  onStreamReady?: (stream: MediaStream) => void;
  isLibraryOpen: boolean;
  theme: "dark" | "light" | "system";
};

export default function HeroSection({
  language,
  isListening,
  preparingCountdown,
  microphoneStream,
  onRecognize,
  onOpenUpload,
  onToggleLanguage,
  onToggleTheme,
  onToggleLibrary,
  onStreamReady,
  isLibraryOpen,
  theme,
}: HeroSectionProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [buttonScale, setButtonScale] = useState(1);

  useEffect(() => {
    if (microphoneStream && onStreamReady) {
      onStreamReady(microphoneStream);
    }
  }, [microphoneStream, onStreamReady]);

  useEffect(() => {
    if (!isListening || !microphoneStream) {
      setButtonScale(1);
      return;
    }

    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.82;

    const source = context.createMediaStreamSource(microphoneStream);
    source.connect(analyser);

    const canvas = canvasRef.current;
    const canvasContext = canvas?.getContext("2d");
    const frequencyData = new Uint8Array(analyser.frequencyBinCount);

    const draw = () => {
      analyser.getByteFrequencyData(frequencyData);
      const averageAmplitude = frequencyData.reduce((sum, value) => sum + value, 0) / Math.max(1, frequencyData.length);
      const normalized = Math.min(1, averageAmplitude / 180);
      setButtonScale(1 + normalized * 0.15);

      if (canvasContext && canvas) {
        canvasContext.clearRect(0, 0, canvas.width, canvas.height);
        const barWidth = 4;
        const gap = 2;
        const barCount = Math.floor(canvas.width / (barWidth + gap));
        canvasContext.fillStyle = "var(--surface-subtle)";
        canvasContext.fillRect(0, 0, canvas.width, canvas.height);
        canvasContext.fillStyle = "var(--accent)";

        for (let index = 0; index < barCount; index += 1) {
          const dataIndex = Math.floor((index / barCount) * frequencyData.length);
          const value = frequencyData[dataIndex] ?? 0;
          const barHeight = Math.max(2, (value / 255) * canvas.height);
          const x = index * (barWidth + gap);
          const y = canvas.height - barHeight;
          canvasContext.fillRect(x, y, barWidth, barHeight);
        }
      }

      animationFrameRef.current = window.requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationFrameRef.current) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
      setButtonScale(1);
      source.disconnect();
      analyser.disconnect();
      void context.close();
    };
  }, [isListening, microphoneStream]);

  return (
    <section className="heroSurface relative overflow-hidden rounded-[28px] p-6 sm:p-10">
      <div className="heroAccentOverlay" />
      <div className="heroNoiseOverlay" />
      <div className="relative">
        <div className="mb-8 flex flex-wrap items-center justify-end gap-2">
          <Button aria-label={isLibraryOpen ? t("hide_library", language) : t("show_library", language)} variant="secondary" size="sm" className="glassBtn" onClick={onToggleLibrary}>{isLibraryOpen ? t("hide_library", language) : t("show_library", language)}</Button>
          <Button aria-label={t("language_label", language)} variant="secondary" size="sm" className="glassBtn" onClick={onToggleLanguage}>{language === "en" ? "БГ" : "EN"}</Button>
          <Button aria-label={theme === "dark" ? t("theme_light", language) : t("theme_dark", language)} variant="secondary" size="sm" className="glassBtn" onClick={onToggleTheme}>{theme === "dark" ? t("theme_light", language) : t("theme_dark", language)}</Button>
        </div>

        <p className="type-display text-center text-sm uppercase tracking-[0.28em] text-text-muted">{language === "bg" ? "ПонотИИ" : "PonotAI"}</p>
        <h1 className="display-styled hero-title-flourish mt-3 text-center text-4xl font-bold sm:text-5xl">{t("hero_tagline", language)}</h1>

        <div className="mt-10 flex flex-col items-center gap-5">
          <button
            onClick={onRecognize}
            className={`recognizeHeroButton ${preparingCountdown ? "opacity-70" : ""}`}
            style={{ transform: `scale(${isListening ? buttonScale : 1})` }}
            aria-label={t("btn_recognize_audio", language)}
          >
            {preparingCountdown ? (
              <span className="text-5xl font-bold text-[var(--text)]">{preparingCountdown}</span>
            ) : (
              <>
                {isListening ? <Radio className="w-10 h-10 text-[var(--accent-foreground)]" /> : <Mic className="w-10 h-10 text-[var(--accent-foreground)]" />}
                <span className="mt-2 text-base font-semibold tracking-wide text-[var(--accent-foreground)]">{t("hero_title", language)}</span>
                {isListening && <span className="mt-1 text-xs text-[color:color-mix(in_srgb,var(--accent-foreground)_74%,transparent)]">{t("recognizing_status", language)}</span>}
              </>
            )}
          </button>

          {isListening && (
            <canvas
              ref={canvasRef}
              width={280}
              height={64}
              className="h-16 w-[280px] rounded-xl border border-border bg-[var(--surface-subtle)]"
              aria-label="Audio waveform visualizer"
            />
          )}

          <Button onClick={onOpenUpload} variant="secondary" className="secondaryHeroAction flex items-center gap-2">
            <Camera className="w-4 h-4" />
            {t("btn_upload_photo", language)}
          </Button>
        </div>
      </div>
    </section>
  );
}
