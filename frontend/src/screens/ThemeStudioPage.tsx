'use client';

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronLeft, Plus, RotateCcw, Save, Settings, Sparkles, Trash2 } from "../../lucide-react";
import { UI_PRESETS, type NamedThemeDraft, type UiPersonalization, useTheme } from "../../lib/ThemeContext";
import { formatUtcDateTime } from "../../lib/dateFormat";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import ThemeStudioControls from "../components/theme/ThemeStudioControls";

type SortMode = "name" | "newest";
type ShadowDepth = "off" | "light" | "medium" | "heavy";
type AnimationSpeed = "slow" | "medium" | "fast";

const FEATURED_PRESETS = ["Ember", "Aurora", "Midnight", "Ocean", "Forest", "Rose", "Void"] as const;
const PRESET_COPY: Record<string, string> = {
  Ember: "Warm orange glow with dark backdrop",
  Aurora: "Purple neon gradients with soft bloom",
  Midnight: "Deep blue contrast for low-light focus",
  Ocean: "Cyan-blue ambient pulse",
  Forest: "Emerald glow with calm depth",
  Rose: "Pink neon highlights",
  Void: "Grayscale cinematic black",
};
const PRESET_GRADIENT: Record<string, string> = {
  Ember: "from-orange-400/70 via-amber-500/45 to-zinc-900",
  Aurora: "from-violet-400/70 via-fuchsia-500/45 to-zinc-900",
  Midnight: "from-blue-500/65 via-indigo-600/40 to-zinc-950",
  Ocean: "from-cyan-400/70 via-blue-500/45 to-zinc-900",
  Forest: "from-emerald-400/70 via-green-500/40 to-zinc-900",
  Rose: "from-pink-400/70 via-rose-500/45 to-zinc-900",
  Void: "from-zinc-500/50 via-zinc-700/55 to-black",
};
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
  }, [themeApi]);

  const cardShadow = {
    off: "shadow-none",
    light: "shadow-[0_10px_26px_rgba(0,0,0,0.25)]",
    medium: "shadow-[0_14px_36px_rgba(0,0,0,0.38)]",
    heavy: "shadow-[0_20px_52px_rgba(0,0,0,0.52)]",
  }[shadowDepth];

  function resolvedDraftName(base: string) {
    const trimmed = base.trim();
    if (trimmed) return trimmed;
    return `Untitled theme ${themeApi.namedThemeDrafts.length + 1}`;
  }

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
    <div className="mx-auto w-full max-w-[1320px] space-y-6 px-4 pb-[calc(var(--layout-bottom-offset)+24px)] pt-2 sm:px-6 sm:pt-4">
      <section className="rounded-3xl border border-[var(--border)] bg-[radial-gradient(circle_at_top_left,rgba(var(--accent-rgb),0.12)_0%,transparent_55%)] bg-[var(--panel-surface)] p-6 text-[var(--text)]">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Theme studio</p>
        <h1 className="display-styled text-4xl font-semibold tracking-tight">Theme Studio</h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">Premium neon styling with safe preview sessions. Sidebar and player bar stay untouched until you apply.</p>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          <Card className={`space-y-4 border border-[var(--border)] bg-[var(--panel-surface)] p-5 ${cardShadow}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-[var(--text)]"><Sparkles className="h-4 w-4 text-[var(--accent)]" />Theme Presets</h2>
              <p className="text-xs text-[var(--muted)]">Click a card to apply in preview</p>
            </div>
            <div className="overflow-x-auto pb-2">
              <div className="flex min-w-max gap-3">
                {FEATURED_PRESETS.map((name) => {
                  const isActive = activePresetName === name;
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => applyPreset(name)}
                      aria-label={`Apply ${name} preset`}
                      className={`w-56 rounded-2xl border bg-[var(--surface)] p-3 text-left transition ${isActive ? "border-[var(--accent-border)] shadow-[0_0_0_1px_var(--accent-border),0_0_26px_rgba(var(--accent-rgb),0.24)]" : "border-[var(--border)] hover:border-[var(--accent-border)]"}`}
                    >
                      <div className={`h-24 rounded-xl bg-gradient-to-r ${PRESET_GRADIENT[name]}`} />
                      <div className="mt-3 flex items-center justify-between">
                        <p className="font-medium text-[var(--text)]">{name}</p>
                        {isActive ? <span className="rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-[var(--text)]">Active</span> : null}
                      </div>
                      <p className="mt-1 text-xs text-[var(--muted)]">{PRESET_COPY[name]}</p>
                    </button>
                  );
                })}
                <button type="button" onClick={duplicateCurrentTheme} className="w-56 rounded-2xl border border-dashed border-[var(--accent-border)] bg-[var(--accent-soft)] p-3 text-left text-[var(--text)]">
                  <p className="inline-flex items-center gap-2 font-semibold"><Plus className="h-4 w-4" />Create New</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">Creates a duplicate using “Profile name” or an automatic fallback.</p>
                </button>
              </div>
            </div>

            <div className="grid gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] p-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
              <Input value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="Profile name" aria-label="Profile name" />
              <Button size="sm" variant="secondary" onClick={saveNamedDraft}><Sparkles className="h-4 w-4" />Save current as profile</Button>
              <Button size="sm" variant="ghost" onClick={duplicateCurrentTheme}><Plus className="h-4 w-4" />Create copy</Button>
            </div>
            {saveError ? <p className="text-xs text-danger">{saveError}</p> : null}
          </Card>

          <Card className={`space-y-4 border border-[var(--border)] bg-[var(--panel-surface)] p-5 ${cardShadow}`}>
            <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-[var(--text)]"><Settings className="h-4 w-4 text-[var(--accent)]" />Design your own theme</h2>
            <p className="text-xs text-[var(--muted)]">Preview-only controls for this mock canvas: accent hex, typography scale, corner radius, shadow depth, animation speed.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs text-[var(--muted)]">Preview accent (hex)</label>
                <div className="mt-1 flex gap-2">
                  <Input value={hexInput} onChange={(e) => setHexInput(e.target.value)} />
                  <Button size="sm" onClick={applyHexPreview}>Apply</Button>
                </div>
                {hexError ? <p className="mt-1 text-xs text-danger">{hexError}</p> : null}
              </div>
              <div>
                <p className="text-xs text-[var(--muted)]">Neon swatches (preview-only)</p>
                <div className="mt-2 flex gap-2">{PREVIEW_SWATCHES.map((swatch) => <button key={swatch} type="button" aria-label={`Use ${swatch}`} className="h-7 w-7 rounded-full border border-[var(--border)]" style={{ backgroundColor: swatch }} onClick={() => { setHexInput(swatch); setPreviewAccent(swatch); }} />)}</div>
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-[var(--muted)]">Typography Scale: {typographyScale}% (Preview-only)</label>
                <input type="range" min={80} max={120} value={typographyScale} onChange={(e) => setTypographyScale(Number(e.target.value))} className="w-full" />
              </div>
              <div>
                <label className="text-xs text-[var(--muted)]">Corner Radius: {cornerRadius}px (Preview-only)</label>
                <input type="range" min={0} max={16} value={cornerRadius} onChange={(e) => setCornerRadius(Number(e.target.value))} className="w-full" />
              </div>
              <div>
                <p className="text-xs text-[var(--muted)]">Shadow depth (Preview-only)</p>
                <div className="mt-1 flex flex-wrap gap-1">{(["off", "light", "medium", "heavy"] as const).map((v) => <button key={v} type="button" onClick={() => setShadowDepth(v)} className={`rounded-full border px-2 py-1 text-xs ${shadowDepth === v ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--text)]" : "border-[var(--border)] text-[var(--muted)]"}`}>{v}</button>)}</div>
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs text-[var(--muted)]">Animation speed (Preview-only)</p>
                <div className="mt-1 flex gap-1">{(["slow", "medium", "fast"] as const).map((v) => <button key={v} type="button" onClick={() => setAnimationSpeed(v)} className={`rounded-full border px-2 py-1 text-xs ${animationSpeed === v ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--text)]" : "border-[var(--border)] text-[var(--muted)]"}`}>{v}</button>)}</div>
              </div>
            </div>
            <ThemeStudioControls ui={themeApi} onUpdate={updateStudioSetting} onApplyPreset={applyPreset} onApplyPatch={themeApi.applyPersonalization} />
          </Card>
        </div>

        <div className="space-y-6">
          <Card className={`space-y-4 border border-[var(--border)] bg-[var(--panel-surface)] p-5 ${cardShadow}`}>
            <div className="flex items-center justify-between">
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
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] p-3 text-xs text-[var(--muted)]">Current active theme: {formatThemeSummary(themeApi)}</div>
            <div className="flex flex-wrap gap-2">
              {!themeApi.isPreviewSessionActive ? <Button variant="secondary" size="sm" onClick={() => themeApi.startPreviewSession("theme-studio")}><Sparkles className="h-4 w-4" />Start preview session</Button> : null}
              {themeApi.isPreviewSessionActive ? <Button variant="ghost" size="sm" onClick={themeApi.discardPreviewSession}><RotateCcw className="h-4 w-4" />Discard preview</Button> : null}
              {themeApi.isPreviewSessionActive ? <Button variant="primary" size="sm" onClick={themeApi.applyPreviewSession}><Save className="h-4 w-4" />Apply as active theme</Button> : null}
            </div>
          </Card>

          <Card className={`space-y-4 border border-[var(--border)] bg-[var(--panel-surface)] p-5 ${cardShadow}`}>
            <h3 className="text-lg font-semibold text-[var(--text)]">Live Preview</h3>
            <div className="rounded-2xl border border-[var(--border)] bg-[radial-gradient(circle_at_top,rgba(var(--accent-rgb),0.12)_0%,transparent_60%)] bg-[var(--surface)] p-4" style={{ borderRadius: `${cornerRadius}px`, fontSize: `${typographyScale}%`, transitionDuration: animationSpeed === "slow" ? "450ms" : animationSpeed === "medium" ? "260ms" : "140ms" }}>
              <div className="flex items-center justify-between"><p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">Preview app</p><span className="text-[10px] text-[var(--muted)]">Theme {themeApi.theme}</span></div>
              <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] p-3" style={{ boxShadow: shadowDepth === "off" ? "none" : `0 10px 24px ${previewAccent}33` }}><p className="text-sm font-semibold text-[var(--text)]">Recognition Hero</p><p className="text-xs text-[var(--muted)]">Drop an image to identify tracks instantly.</p></div>
              <div className="mt-3 grid grid-cols-3 gap-2">{["Discover", "Library", "Queue"].map((feature) => <div key={feature} className="rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] p-2 text-center text-[11px] text-[var(--muted)]">{feature}</div>)}</div>
              <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] p-2"><p className="text-sm text-[var(--text)]">Midnight Echo — Nova Coast</p><p className="text-[11px] text-[var(--muted)]">Album mix · 3:21</p></div>
              <div className="mt-3 rounded-full border border-[var(--border)] bg-[var(--surface-subtle)] p-2"><div className="h-1.5 rounded-full bg-[var(--border)]"><div className="h-1.5 rounded-full" style={{ width: "52%", backgroundColor: previewAccent }} /></div></div>
            </div>
          </Card>

          <Card className={`space-y-4 border border-[var(--border)] bg-[var(--panel-surface)] p-5 ${cardShadow}`}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[var(--text)]">Saved Profiles</h3>
              <select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)} className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text)]"><option value="newest">Newest</option><option value="name">Name</option></select>
            </div>
            {sortedDrafts.map((draft) => (
              <article key={draft.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
                <div className="flex items-center justify-between gap-2">
                  {renamingDraftId === draft.id ? <Input value={renameDraftValue} onChange={(event) => setRenameDraftValue(event.target.value)} className="h-8" /> : <p className="font-medium text-[var(--text)]">{draft.name}</p>}
                  <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">Profile</span>
                </div>
                <p className="mt-1 text-xs text-[var(--muted)]">Saved {formatUtcDateTime(draft.savedAt)}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">{formatDraftSummary(draft)}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => themeApi.applyNamedThemeDraft(draft.id)}>Open in preview</Button>
                  {renamingDraftId === draft.id ? <Button size="sm" onClick={() => submitRename(draft.id)}>Save rename</Button> : <Button size="sm" variant="ghost" onClick={() => startRename(draft)}>Rename</Button>}
                  <Button size="sm" variant="ghost" onClick={() => themeApi.deleteNamedThemeDraft(draft.id)}><Trash2 className="h-3.5 w-3.5" /><span className="sr-only">Delete profile</span></Button>
                </div>
              </article>
            ))}
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
