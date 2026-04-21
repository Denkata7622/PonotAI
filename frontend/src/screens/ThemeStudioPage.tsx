'use client';

import Link from "next/link";
import { ChevronLeft, Sparkles, RotateCcw, Save } from "../../lucide-react";
import { UI_PRESETS, type UiPersonalization, useTheme } from "../../lib/ThemeContext";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import ThemeStudioControls from "../components/theme/ThemeStudioControls";

export default function ThemeStudioPage() {
  const themeApi = useTheme();

  function updateStudioSetting<K extends keyof UiPersonalization>(key: K, value: UiPersonalization[K]) {
    if (!themeApi.isPreviewSessionActive) {
      themeApi.startPreviewSession("theme-studio", { [key]: value });
      return;
    }
    themeApi.updateUiSetting(key, value);
  }

  function applyPreset(presetName: string) {
    const preset = UI_PRESETS[presetName];
    if (!preset) return;
    if (!themeApi.isPreviewSessionActive) {
      themeApi.startPreviewSession("theme-studio", preset);
      return;
    }
    themeApi.applyPersonalization(preset);
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 pb-[calc(var(--layout-bottom-offset)+24px)] pt-2 sm:px-6 sm:pt-4">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Theme studio</p>
        <h1 className="display-styled text-3xl font-semibold tracking-tight sm:text-4xl">Theme Studio</h1>
        <p className="max-w-3xl text-sm text-[var(--muted)]">
          Build and preview your full visual setup safely. Preview sessions are temporary until you explicitly apply.
        </p>
      </header>

      <Card variant="settings" className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--accent-border)] bg-[var(--accent-soft)] p-3">
          <p className="text-sm">
            {themeApi.isPreviewSessionActive
              ? `Preview session active from ${themeApi.previewSession?.origin ?? "theme-studio"}.`
              : "No preview session yet. Changing a control will start one automatically."}
          </p>
          <div className="flex flex-wrap gap-2">
            {!themeApi.isPreviewSessionActive ? (
                <Button variant="secondary" size="sm" onClick={() => themeApi.startPreviewSession("theme-studio")}>
                <span className="inline-flex items-center gap-2"><Sparkles className="h-4 w-4" />Start preview session</span>
                </Button>
            ) : null}
            {themeApi.isPreviewSessionActive ? (
              <>
                <Button variant="ghost" size="sm" onClick={themeApi.discardPreviewSession}>
                  <span className="inline-flex items-center gap-2"><RotateCcw className="h-4 w-4" />Discard preview</span>
                </Button>
                <Button variant="primary" size="sm" onClick={themeApi.applyPreviewSession}>
                  <span className="inline-flex items-center gap-2"><Save className="h-4 w-4" />Apply as active theme</span>
                </Button>
              </>
            ) : null}
          </div>
        </div>

        <ThemeStudioControls ui={themeApi} onUpdate={updateStudioSetting} onApplyPreset={applyPreset} />

        <div className="flex flex-wrap gap-2">
          <Link href="/personalization">
            <Button variant="ghost" size="sm">
              <span className="inline-flex items-center gap-2"><ChevronLeft className="h-4 w-4" />Back to Personalization</span>
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
