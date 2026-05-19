'use client';

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronLeft, Plus, RotateCcw, Save, Settings, Sparkles, Trash2 } from "../../lucide-react";
import { THEME_PRESET_DEFINITIONS, UI_PRESETS, getThemePresetById, type NamedThemeDraft, type UiPersonalization, useTheme } from "../../lib/ThemeContext";
import { formatUtcDateTime } from "../../lib/dateFormat";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import ThemePresetCard from "../components/theme/ThemePresetCard";
import ThemeStudioControls from "../components/theme/ThemeStudioControls";

type SortMode = "name" | "newest";
type ShadowDepth = "off" | "light" | "medium" | "heavy";
type AnimationSpeed = "slow" | "medium" | "fast";

const PREVIEW_SWATCHES = ["#ff8a1f", "#8b5cf6", "#3b82f6", "#06b6d4", "#22c55e", "#ec4899"];

function formatThemeSummary(themeApi: ReturnType<typeof useTheme>) {
  return `${themeApi.theme} · ${themeApi.accent} · ${themeApi.surfaceStyle} · ${themeApi.displayFont}`;
}

function formatDraftSummary(draft: NamedThemeDraft) {
  return `${draft.payload.theme} · ${draft.payload.accent} · ${draft.payload.surfaceStyle} · ${draft.payload.displayFont}`;
}

export default function ThemeStudioPage() {
  const themeApi = useTheme();
  const [draftName, setDraftName] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [renamingDraftId, setRenamingDraftId] = useState<string | null>(null);
  const [renameDraftValue, setRenameDraftValue] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("newest");

  const [typographyScale, setTypographyScale] = useState(100);
  const [cornerRadius, setCornerRadius] = useState(10);
  const [shadowDepth, setShadowDepth] = useState<ShadowDepth>("medium");
  const [animationSpeed, setAnimationSpeed] = useState<AnimationSpeed>("medium");
  const [hexInput, setHexInput] = useState("#8b5cf6");
  const [hexError, setHexError] = useState<string | null>(null);
  const [previewAccent, setPreviewAccent] = useState("#8b5cf6");

  const statusMeta = useMemo(() => {
    if (!themeApi.isPreviewSessionActive) return { label: "Saved", detail: "Active theme and persisted theme are in sync." };
    if (themeApi.hasPreviewChanges) return { label: "Unsaved changes", detail: "Preview differs from your active saved theme." };
    return { label: "Preview active", detail: "Preview is open but still matches your active saved theme." };
  }, [themeApi.hasPreviewChanges, themeApi.isPreviewSessionActive]);

  const sortedDrafts = useMemo(() => {
    const entries = [...themeApi.namedThemeDrafts];
    if (sortMode === "name") return entries.sort((a, b) => a.name.localeCompare(b.name));
    return entries.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  }, [sortMode, themeApi.namedThemeDrafts]);

  const activePresetName = useMemo(() => {
    const entry = Object.entries(UI_PRESETS).find(([, preset]) => (
      preset.theme === themeApi.theme
      && preset.accent === themeApi.accent
      && preset.surfaceStyle === themeApi.surfaceStyle
      && preset.density === themeApi.density
      && preset.radius === themeApi.radius
      && preset.displayFont === themeApi.displayFont
      && preset.bodyFont === themeApi.bodyFont
    ));
    return entry?.[0] ?? null;
  }, [themeApi.theme, themeApi.accent, themeApi.surfaceStyle, themeApi.density, themeApi.radius, themeApi.displayFont, themeApi.bodyFont]);
  function resolvedDraftName(base: string) {
    const trimmed = base.trim();
    if (trimmed) return trimmed;
    return `Untitled theme ${themeApi.namedThemeDrafts.length + 1}`;
  }

  function applyStudioPatch(patch: Partial<UiPersonalization>) {
    if (!themeApi.isPreviewSessionActive) {
      themeApi.startPreviewSession("theme-studio", patch);
      return;
    }
    themeApi.applyPersonalization(patch);
  }

  function updateStudioSetting<K extends keyof UiPersonalization>(key: K, value: UiPersonalization[K]) {
    if (!themeApi.isPreviewSessionActive) {
      themeApi.startPreviewSession("theme-studio", { [key]: value });
      return;
    }
    applyStudioPatch({ [key]: value });
  }

  function applyPreset(presetName: string) {
    const preset = getThemePresetById(presetName)?.personalization;
    if (!preset) return;
    if (!themeApi.isPreviewSessionActive) {
      themeApi.startPreviewSession("theme-studio", preset);
      return;
    }
    themeApi.applyPersonalization(preset);
  }

  function applyHexPreview() {
    const candidate = hexInput.trim();
    if (!/^#([0-9A-Fa-f]{6})$/.test(candidate)) {
      setHexError("Enter a valid 6-digit hex color.");
      return;
    }
    setHexError(null);
    setPreviewAccent(candidate);
  }

  function saveNamedDraft() {
    const result = themeApi.saveNamedThemeDraft(resolvedDraftName(draftName));
    if (!result.ok) {
      setSaveError("Could not save profile.");
      return;
    }
    setDraftName("");
    setSaveError(null);
  }

  function duplicateCurrentTheme() {
    const result = themeApi.duplicateCurrentThemeAsDraft(resolvedDraftName(draftName));
    if (!result.ok) {
      setSaveError("Could not create profile copy.");
      return;
    }
    setDraftName("");
    setSaveError(null);
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

  return (
    <div className="mx-auto w-full min-w-0 max-w-[1320px] space-y-6 overflow-x-hidden px-3 pb-[calc(var(--layout-bottom-offset)+32px)] pt-2 sm:px-5 sm:pt-4">
      <section className="overflow-hidden rounded-3xl border border-[var(--border)] bg-[radial-gradient(circle_at_top_left,rgba(var(--accent-rgb),0.12)_0%,transparent_55%)] bg-[var(--panel-surface)] p-4 text-[var(--text)] sm:p-6">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Theme studio</p>
        <h1 className="display-styled text-3xl font-semibold tracking-tight sm:text-4xl">Theme Studio</h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">Premium neon styling with safe preview sessions. Sidebar and player bar stay untouched until you apply.</p>
      </section>

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.9fr)]">
        <div className="min-w-0 space-y-6">
          <Card className="min-w-0 overflow-hidden space-y-4 border border-[var(--border)] bg-[var(--panel-surface)] p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-[var(--text)]"><Sparkles className="h-4 w-4 text-[var(--accent)]" />Theme Presets</h2>
              <p className="text-xs text-[var(--muted)]">Click a card to apply in preview</p>
            </div>
            <div className="-mx-2 overflow-x-auto overscroll-x-contain px-2 pb-2">
              <div className="flex min-w-full gap-3">
                {THEME_PRESET_DEFINITIONS.map((preset) => (
                  <div key={preset.id} className="shrink-0">
                    <ThemePresetCard
                      preset={preset}
                      selected={activePresetName === preset.id}
                      onSelect={applyPreset}
                    />
                  </div>
                ))}
                <button type="button" onClick={duplicateCurrentTheme} className="w-[min(14rem,calc(100vw-4rem))] shrink-0 rounded-2xl border border-dashed border-[var(--accent-border)] bg-[var(--accent-soft)] p-3 text-left text-[var(--text)]">
                  <p className="inline-flex items-center gap-2 font-semibold"><Plus className="h-4 w-4" />Create copy</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">Duplicates current theme using “Profile name” or an automatic fallback.</p>
                </button>
              </div>
            </div>

            <div className="grid gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
              <Input className="min-w-0" value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="Profile name" aria-label="Profile name" />
              <Button className="w-full sm:w-auto" size="sm" variant="secondary" onClick={saveNamedDraft}><Sparkles className="h-4 w-4" />Save current as profile</Button>
              <Button className="w-full sm:w-auto" size="sm" variant="ghost" onClick={duplicateCurrentTheme}><Plus className="h-4 w-4" />Create copy</Button>
            </div>
            {saveError ? <p className="text-xs text-danger">{saveError}</p> : null}
          </Card>

          <Card className="min-w-0 overflow-hidden space-y-4 border border-[var(--border)] bg-[var(--panel-surface)] p-4 sm:p-5">
            <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-[var(--text)]"><Settings className="h-4 w-4 text-[var(--accent)]" />Design your own theme</h2>
            <p className="text-xs text-[var(--muted)]">Canvas controls for accent hex, typography scale, corner radius, shadow depth, and animation speed.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs text-[var(--muted)]">Preview accent (hex)</label>
                <div className="mt-1 flex min-[420px]:flex-row flex-col gap-2">
                  <Input className="min-w-0 flex-1" value={hexInput} onChange={(e) => setHexInput(e.target.value)} />
                  <Button size="sm" onClick={applyHexPreview}>Apply</Button>
                </div>
                {hexError ? <p className="mt-1 text-xs text-danger">{hexError}</p> : null}
              </div>
              <div>
                <p className="text-xs text-[var(--muted)]">Accent swatches</p>
                <div className="mt-2 flex flex-wrap gap-2">{PREVIEW_SWATCHES.map((swatch) => <button key={swatch} type="button" aria-label={`Use ${swatch}`} className="h-7 w-7 rounded-full border border-[var(--border)]" style={{ backgroundColor: swatch }} onClick={() => { setHexInput(swatch); setPreviewAccent(swatch); }} />)}</div>
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-[var(--muted)]">Typography Scale: {typographyScale}%</label>
                <input type="range" min={80} max={120} value={typographyScale} onChange={(e) => setTypographyScale(Number(e.target.value))} className="w-full" />
              </div>
              <div>
                <label className="text-xs text-[var(--muted)]">Corner Radius: {cornerRadius}px</label>
                <input type="range" min={0} max={16} value={cornerRadius} onChange={(e) => setCornerRadius(Number(e.target.value))} className="w-full" />
              </div>
              <div>
                <p className="text-xs text-[var(--muted)]">Shadow depth</p>
                <div className="mt-1 flex flex-wrap gap-1">{(["off", "light", "medium", "heavy"] as const).map((v) => <button key={v} type="button" onClick={() => setShadowDepth(v)} className={`rounded-full border px-2 py-1 text-xs ${shadowDepth === v ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--text)]" : "border-[var(--border)] text-[var(--muted)]"}`}>{v}</button>)}</div>
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs text-[var(--muted)]">Animation speed</p>
                <div className="mt-1 flex flex-wrap gap-1">{(["slow", "medium", "fast"] as const).map((v) => <button key={v} type="button" onClick={() => setAnimationSpeed(v)} className={`rounded-full border px-2 py-1 text-xs ${animationSpeed === v ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--text)]" : "border-[var(--border)] text-[var(--muted)]"}`}>{v}</button>)}</div>
              </div>
            </div>
            <ThemeStudioControls ui={themeApi} onUpdate={updateStudioSetting} onApplyPreset={applyPreset} onApplyPatch={applyStudioPatch} />
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <Card className="min-w-0 overflow-hidden space-y-4 border border-[var(--border)] bg-[var(--panel-surface)] p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-semibold text-[var(--text)]">Session status</h3>
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
            <p className="text-sm text-[var(--text)]">{statusMeta.label}</p>
            <p className="text-xs text-[var(--muted)]">{statusMeta.detail}</p>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] p-3 text-xs text-[var(--muted)]">Current/preview theme: {formatThemeSummary(themeApi)}</div>
            <div className="flex flex-wrap gap-2">
              {!themeApi.isPreviewSessionActive ? <Button variant="secondary" size="sm" onClick={() => themeApi.startPreviewSession("theme-studio")}><Sparkles className="h-4 w-4" />Start preview session</Button> : null}
              {themeApi.isPreviewSessionActive ? <Button variant="ghost" size="sm" onClick={themeApi.discardPreviewSession}><RotateCcw className="h-4 w-4" />Discard preview</Button> : null}
              {themeApi.isPreviewSessionActive ? <Button variant="primary" size="sm" onClick={themeApi.applyPreviewSession}><Save className="h-4 w-4" />Apply as active theme</Button> : null}
            </div>
          </Card>

          <Card className="min-w-0 overflow-hidden space-y-4 border border-[var(--border)] bg-[var(--panel-surface)] p-4 sm:p-5">
            <h3 className="text-lg font-semibold text-[var(--text)]">Live Preview</h3>
            <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[radial-gradient(circle_at_top,rgba(var(--accent-rgb),0.12)_0%,transparent_60%)] bg-[var(--surface)] p-3 transition-all sm:p-4" style={{ borderRadius: `${cornerRadius}px`, fontSize: `${typographyScale}%`, transitionDuration: animationSpeed === "slow" ? "450ms" : animationSpeed === "medium" ? "260ms" : "140ms", transitionProperty: "all" }}>
              <div className="flex items-center justify-between"><p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">Preview app</p><span className="text-[10px] text-[var(--muted)]">Theme {themeApi.theme}</span></div>
              <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] p-3" style={{ boxShadow: shadowDepth === "off" ? "none" : `0 10px 24px ${previewAccent}33` }}><p className="text-sm font-semibold text-[var(--text)]">Recognition Hero</p><p className="text-xs text-[var(--muted)]">Drop an image to identify tracks instantly.</p></div>
              <div className="mt-3 grid grid-cols-1 gap-2 min-[420px]:grid-cols-3">{["Discover", "Library", "Queue"].map((feature) => <div key={feature} className="rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] p-2 text-center text-[11px] text-[var(--muted)]">{feature}</div>)}</div>
              <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] p-2"><p className="text-sm text-[var(--text)]">Signal Echo - Nova Coast</p><p className="text-[11px] text-[var(--muted)]">Album mix · 3:21</p></div>
              <div className="mt-3 rounded-full border border-[var(--border)] bg-[var(--surface-subtle)] p-2"><div className="h-1.5 rounded-full bg-[var(--border)]"><div className="h-1.5 rounded-full" style={{ width: "52%", backgroundColor: previewAccent }} /></div></div>
            </div>
          </Card>

          <Card className="min-w-0 overflow-hidden space-y-4 border border-[var(--border)] bg-[var(--panel-surface)] p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[var(--text)]">Saved Profiles</h3>
              <select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)} className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text)]"><option value="newest">Newest</option><option value="name">Name</option></select>
            </div>
            {sortedDrafts.map((draft) => (
              <article key={draft.id} className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
                <div className="flex items-center justify-between gap-2">
                  {renamingDraftId === draft.id ? <Input value={renameDraftValue} onChange={(event) => setRenameDraftValue(event.target.value)} className="h-8" /> : <p className="truncate font-medium text-[var(--text)]">{draft.name}</p>}
                  <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">Profile</span>
                </div>
                <p className="mt-1 break-words text-xs text-[var(--muted)]">Saved {formatUtcDateTime(draft.savedAt)}</p>
                <p className="mt-1 break-words text-xs text-[var(--muted)]">{formatDraftSummary(draft)}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => themeApi.applyNamedThemeDraft(draft.id)}>Open in preview</Button>
                  {renamingDraftId === draft.id ? <Button size="sm" onClick={() => submitRename(draft.id)}>Save rename</Button> : <Button size="sm" variant="ghost" onClick={() => startRename(draft)}>Rename</Button>}
                  <Button size="sm" variant="ghost" onClick={() => themeApi.deleteNamedThemeDraft(draft.id)}><Trash2 className="h-3.5 w-3.5" /><span className="sr-only">Delete profile</span></Button>
                </div>
              </article>
            ))}
            {sortedDrafts.length === 0 ? <p className="text-xs text-[var(--muted)]">No saved profiles yet.</p> : null}
            {saveError ? <p className="text-xs text-danger">{saveError}</p> : null}
          </Card>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/personalization"><Button variant="ghost" size="sm"><ChevronLeft className="h-4 w-4" />Back to Personalization</Button></Link>
      </div>
    </div>
  );
}
