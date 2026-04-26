'use client';

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronLeft, Plus, RotateCcw, Save, Sparkles, Trash2 } from "../../lucide-react";
import { UI_PRESETS, type NamedThemeDraft, type UiPersonalization, useTheme } from "../../lib/ThemeContext";
import { formatUtcDateTime } from "../../lib/dateFormat";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import ThemeStudioControls from "../components/theme/ThemeStudioControls";
import { useUser } from "../context/UserContext";

function formatThemeSummary(themeApi: ReturnType<typeof useTheme>) {
  return `${themeApi.theme} · ${themeApi.accent} · ${themeApi.surfaceStyle} · ${themeApi.displayFont}`;
}

function formatDraftSummary(draft: NamedThemeDraft) {
  return `${draft.payload.theme} · ${draft.payload.accent} · ${draft.payload.surfaceStyle} · ${draft.payload.displayFont}`;
}

export default function ThemeStudioPage() {
  const themeApi = useTheme();
  const { user } = useUser();
  const [draftName, setDraftName] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [renamingDraftId, setRenamingDraftId] = useState<string | null>(null);
  const [renameDraftValue, setRenameDraftValue] = useState("");

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

  function duplicateCurrentTheme() {
    const result = themeApi.duplicateCurrentThemeAsDraft(draftName || undefined);
    if (!result.ok) {
      setSaveError("Enter a draft name first.");
      return;
    }
    setSaveError(null);
    setDraftName("");
  }

  function startRename(draft: NamedThemeDraft) {
    setRenamingDraftId(draft.id);
    setRenameDraftValue(draft.name);
    setSaveError(null);
  }

  function submitRename(draftId: string) {
    const result = themeApi.renameNamedThemeDraft(draftId, renameDraftValue);
    if (!result.ok) {
      setSaveError(result.reason === "not-found" ? "Draft was not found." : "Draft name cannot be empty.");
      return;
    }
    setRenamingDraftId(null);
    setRenameDraftValue("");
    setSaveError(null);
  }

  const recommendationDataSharingEnabled = Boolean(user?.recommendationDataSharingEnabled);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 pb-[calc(var(--layout-bottom-offset)+24px)] pt-2 sm:px-6 sm:pt-4">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Theme studio</p>
        <h1 className="display-styled text-3xl font-semibold tracking-tight sm:text-4xl">Theme Studio</h1>
        <p className="max-w-3xl text-sm text-[var(--muted)]">
          Build and preview your full visual setup safely. Preview sessions are temporary until you explicitly apply.
        </p>
      </header>

      <Card variant="settings" className="space-y-5 p-5">
        <section className="space-y-3 rounded-2xl border border-[var(--accent-border)] bg-[var(--accent-soft)]/70 p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">Theme ownership row</p>
              <h2 className="display-styled text-xl font-semibold tracking-tight">My theme collection</h2>
              <p className="text-xs text-[var(--muted)]">Local drafts are slot-ready scaffolds today and stay honest while full slot persistence is still roadmap.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                placeholder="Name draft"
                className="w-44"
              />
              <Button variant="secondary" size="sm" onClick={saveNamedDraft}>Save draft</Button>
              <Button variant="ghost" size="sm" onClick={duplicateCurrentTheme}>
                <span className="inline-flex items-center gap-1.5"><Plus className="h-4 w-4" />Duplicate current</span>
              </Button>
            </div>
          </div>
          {saveError ? <p className="text-xs text-danger">{saveError}</p> : null}

          <div className="overflow-x-auto pb-1">
            <div className="grid min-w-full auto-cols-[minmax(260px,1fr)] grid-flow-col gap-3 lg:grid-flow-row lg:grid-cols-4">
              <article className="rounded-2xl border border-[var(--accent-border)] bg-[var(--panel-surface)] p-4 shadow-[0_10px_30px_rgba(var(--accent-rgb),0.18)]">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">Current active theme</p>
                  <span className="rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] uppercase tracking-[0.08em]">Active</span>
                </div>
                <p className="mt-1 text-xs text-[var(--muted)]">Applied setup</p>
                <p className="mt-3 text-sm font-medium">{formatThemeSummary(themeApi)}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">{statusMeta.label}</p>
              </article>

              {themeApi.namedThemeDrafts.map((draft) => (
                <article key={draft.id} className="rounded-2xl border border-[var(--border)] bg-[var(--panel-surface)] p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      {renamingDraftId === draft.id ? (
                        <div className="flex gap-2">
                          <Input
                            value={renameDraftValue}
                            onChange={(event) => setRenameDraftValue(event.target.value)}
                            className="h-8"
                          />
                          <Button size="sm" onClick={() => submitRename(draft.id)}>Save</Button>
                        </div>
                      ) : (
                        <>
                          <p className="truncate text-sm font-semibold">{draft.name}</p>
                          <p className="mt-1 text-xs text-[var(--muted)]">Saved {formatUtcDateTime(draft.savedAt)}</p>
                        </>
                      )}
                    </div>
                    <span className="rounded-full border border-[var(--border)] bg-[var(--surface-subtle)] px-2 py-0.5 text-[10px] uppercase tracking-[0.08em]">Draft</span>
                  </div>
                  <p className="mt-3 text-xs text-[var(--muted)]">{formatDraftSummary(draft)}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Button size="sm" variant="secondary" onClick={() => themeApi.applyNamedThemeDraft(draft.id)}>Open in preview</Button>
                    <Button size="sm" variant="ghost" onClick={() => startRename(draft)}>Rename</Button>
                    <Button size="sm" variant="ghost" onClick={() => themeApi.deleteNamedThemeDraft(draft.id)}><Trash2 className="h-3.5 w-3.5" /><span className="sr-only">Delete draft</span></Button>
                  </div>
                </article>
              ))}

              <article className="rounded-2xl border border-[var(--border)] bg-[var(--panel-surface)] p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">Bonus slot</p>
                  <span className="rounded-full border border-[var(--border)] bg-[var(--surface-subtle)] px-2 py-0.5 text-[10px] uppercase tracking-[0.08em]">Bonus</span>
                </div>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {recommendationDataSharingEnabled ? "Ready now" : "Paused"}
                </p>
                <p className="mt-3 text-xs text-[var(--muted)]">
                  {recommendationDataSharingEnabled
                    ? "Recommendation data sharing is enabled, so this expansion slot is available in your roadmap path."
                    : "Enable recommendation data sharing in settings to unlock this expansion slot path."}
                </p>
              </article>

              <article className="rounded-2xl border border-dashed border-[var(--border)] bg-black/20 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">Reserved roadmap slot</p>
                  <span className="rounded-full border border-[var(--border)] bg-[var(--surface-subtle)] px-2 py-0.5 text-[10px] uppercase tracking-[0.08em]">Reserved</span>
                </div>
                <p className="mt-1 text-xs text-[var(--muted)]">Future expansion</p>
                <p className="mt-3 text-xs text-[var(--muted)]">Held for a later beta expansion. No premium purchase flow is active.</p>
              </article>
            </div>
          </div>
        </section>

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
