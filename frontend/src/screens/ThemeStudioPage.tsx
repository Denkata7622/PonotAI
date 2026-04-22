'use client';

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronLeft, Sparkles, RotateCcw, Save } from "../../lucide-react";
import { UI_PRESETS, type UiPersonalization, useTheme } from "../../lib/ThemeContext";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import ThemeStudioControls from "../components/theme/ThemeStudioControls";

export default function ThemeStudioPage() {
  const themeApi = useTheme();
  const [draftName, setDraftName] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);

  const statusMeta = useMemo(() => {
    if (!themeApi.isPreviewSessionActive) {
      return { label: "Saved", detail: "Active theme and persisted theme are in sync." };
    }
    if (themeApi.hasPreviewChanges) {
      return { label: "Unsaved changes", detail: "Preview differs from your active saved theme." };
    }
    return { label: "Preview active", detail: "Preview is open but still matches your active saved theme." };
  }, [themeApi.hasPreviewChanges, themeApi.isPreviewSessionActive]);

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

  function saveNamedDraft() {
    const result = themeApi.saveNamedThemeDraft(draftName);
    if (!result.ok) {
      setSaveError("Enter a draft name first.");
      return;
    }
    setSaveError(null);
    setDraftName("");
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
        <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-surface)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">Session status</p>
              <p className="mt-1 text-sm font-semibold">{statusMeta.label}</p>
              <p className="text-xs text-[var(--muted)]">{statusMeta.detail}</p>
            </div>
            {themeApi.isPreviewSessionActive ? (
              <Button
                variant={themeApi.isComparingWithActiveTheme ? "primary" : "secondary"}
                size="sm"
                onMouseDown={() => themeApi.setComparingWithActiveTheme(true)}
                onMouseUp={() => themeApi.setComparingWithActiveTheme(false)}
                onMouseLeave={() => themeApi.setComparingWithActiveTheme(false)}
                onTouchStart={() => themeApi.setComparingWithActiveTheme(true)}
                onTouchEnd={() => themeApi.setComparingWithActiveTheme(false)}
              >
                Hold to compare with current
              </Button>
            ) : null}
          </div>
        </div>

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

        <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-surface)] p-4 space-y-3">
          <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">Save named theme draft</p>
          <p className="text-xs text-[var(--muted)]">Saves locally as a slot-ready draft scaffold. Slot assignment stays in the roadmap layer.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input value={draftName} onChange={(event) => setDraftName(event.target.value)} placeholder="e.g. Midnight Signal" />
            <Button variant="secondary" onClick={saveNamedDraft}>Save draft</Button>
          </div>
          {saveError ? <p className="text-xs text-danger">{saveError}</p> : null}
          {themeApi.namedThemeDrafts.length ? (
            <div className="flex flex-wrap gap-2">
              {themeApi.namedThemeDrafts.slice(0, 6).map((draft) => (
                <button key={draft.id} type="button" className="selectable-card rounded-full border border-[var(--border)] px-3 py-1 text-xs" onClick={() => themeApi.applyNamedThemeDraft(draft.id)}>
                  {draft.name}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <ThemeStudioControls ui={themeApi} onUpdate={updateStudioSetting} onApplyPreset={applyPreset} onApplyPatch={themeApi.applyPersonalization} />

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
