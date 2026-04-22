'use client';

import { useMemo, useState } from "react";
import { Moon, RotateCcw, Search, Sun } from "../../../lucide-react";
import { DEFAULT_UI_PERSONALIZATION, UI_PRESETS, resolveTheme, type AccentIntensity, type BodyFont, type CardEmphasis, type ChartStyle, type DensityMode, type DisplayFont, type DisplayTextStyle, type GlowLevel, type PanelTint, type RadiusMode, type SidebarStyle, type SurfaceStyle, type TextScale, type UiPersonalization } from "../../../lib/ThemeContext";
import { ACCENT_TOKENS, SUPPORTED_ACCENTS } from "../../../lib/themePresets";
import { BODY_FONT_OPTIONS, DISPLAY_FONT_OPTIONS, DISPLAY_TEXT_STYLE_OPTIONS, TEXT_SCALE_OPTIONS } from "../../../lib/typographyConfig";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";

const CONTROL_GROUPS = {
  intensity: ["subtle", "balanced", "vivid"] as AccentIntensity[],
  surfaceStyle: ["flat", "soft", "elevated"] as SurfaceStyle[],
  radius: ["compact", "default", "rounded"] as RadiusMode[],
  density: ["compact", "default", "comfortable"] as DensityMode[],
  chartStyle: ["neutral", "accent-led", "multicolor"] as ChartStyle[],
  sidebarStyle: ["standard", "tinted", "elevated"] as SidebarStyle[],
  motionLevel: ["full", "reduced", "minimal"] as const,
  cardEmphasis: ["standard", "accented", "tinted"] as CardEmphasis[],
  bodyFont: [...BODY_FONT_OPTIONS] as BodyFont[],
  displayFont: [...DISPLAY_FONT_OPTIONS] as DisplayFont[],
  textScale: [...TEXT_SCALE_OPTIONS] as TextScale[],
  glowLevel: ["off", "low", "medium"] as GlowLevel[],
  panelTint: ["off", "subtle", "rich"] as PanelTint[],
  displayTextStyle: [...DISPLAY_TEXT_STYLE_OPTIONS] as DisplayTextStyle[],
} as const;

type FontCategory = "all" | "clean" | "tech" | "gothic" | "handwritten" | "poster" | "playful";

const FONT_LABELS: Record<BodyFont | DisplayFont, string> = {
  inter: "Inter",
  system: "System UI",
  poppins: "Poppins",
  nunito: "Nunito",
  "ibm-plex-sans": "IBM Plex Sans",
  manrope: "Manrope",
  "dm-sans": "DM Sans",
  "plus-jakarta-sans": "Plus Jakarta Sans",
  outfit: "Outfit",
  sora: "Sora",
  "space-grotesk": "Space Grotesk",
  orbitron: "Orbitron",
  audiowide: "Audiowide",
  rajdhani: "Rajdhani",
  "exo-2": "Exo 2",
  oxanium: "Oxanium",
  "chakra-petch": "Chakra Petch",
  "russo-one": "Russo One",
  michroma: "Michroma",
  "pirata-one": "Pirata One",
  "unifraktur-cook": "UnifrakturCook",
  "yatra-one": "Yatra One",
  kalam: "Kalam",
  "marck-script": "Marck Script",
  bungee: "Bungee",
  "bungee-shade": "Bungee Shade",
  monoton: "Monoton",
  "black-ops-one": "Black Ops One",
  "archivo-black": "Archivo Black",
};

const FONT_CATEGORIES: Record<BodyFont | DisplayFont, FontCategory[]> = {
  inter: ["clean"],
  system: ["clean"],
  poppins: ["clean", "playful"],
  nunito: ["playful", "clean"],
  "ibm-plex-sans": ["tech", "clean"],
  manrope: ["clean", "tech"],
  "dm-sans": ["clean"],
  "plus-jakarta-sans": ["clean"],
  outfit: ["tech", "clean"],
  sora: ["tech", "clean"],
  "space-grotesk": ["tech"],
  orbitron: ["tech"],
  audiowide: ["tech", "playful"],
  rajdhani: ["tech"],
  "exo-2": ["tech"],
  oxanium: ["tech"],
  "chakra-petch": ["tech", "playful"],
  "russo-one": ["poster", "tech"],
  michroma: ["tech", "poster"],
  "pirata-one": ["gothic", "poster"],
  "unifraktur-cook": ["gothic"],
  "yatra-one": ["gothic", "playful"],
  kalam: ["handwritten", "playful"],
  "marck-script": ["handwritten"],
  bungee: ["poster", "playful"],
  "bungee-shade": ["poster", "playful"],
  monoton: ["poster", "tech"],
  "black-ops-one": ["poster"],
  "archivo-black": ["poster"],
};

type PreviewSurface = "home-card" | "song-row" | "assistant" | "playlist" | "profile";

const PREVIEW_SURFACES: Array<{ key: PreviewSurface; label: string }> = [
  { key: "home-card", label: "Home card" },
  { key: "song-row", label: "Song row" },
  { key: "assistant", label: "Assistant message" },
  { key: "playlist", label: "Playlist tile" },
  { key: "profile", label: "Profile header" },
];

type Props = {
  ui: UiPersonalization;
  onUpdate: <K extends keyof UiPersonalization>(key: K, value: UiPersonalization[K]) => void;
  onApplyPreset: (presetName: string) => void;
  onApplyPatch?: (patch: Partial<UiPersonalization>) => void;
  className?: string;
};

export default function ThemeStudioControls({ ui, onUpdate, onApplyPreset, onApplyPatch, className }: Props) {
  const [selectedSurface, setSelectedSurface] = useState<PreviewSurface>("home-card");
  const [fontSearch, setFontSearch] = useState("");
  const [fontCategory, setFontCategory] = useState<FontCategory>("all");
  const [recentFonts, setRecentFonts] = useState<Array<BodyFont | DisplayFont>>([]);
  const [recentAccents, setRecentAccents] = useState<Array<UiPersonalization["accent"]>>([]);
  const baseControlKeys = (Object.keys(CONTROL_GROUPS) as Array<keyof typeof CONTROL_GROUPS>).filter((key) => key !== "bodyFont" && key !== "displayFont");

  const summaryLine = `${ui.theme === "system" ? `${resolveTheme(ui.theme)} (system)` : ui.theme}, ${ui.accent}, ${ui.intensity}, ${ui.surfaceStyle}, ${ui.density}, ${FONT_LABELS[ui.displayFont]} display`;

  function rememberFont(font: BodyFont | DisplayFont) {
    setRecentFonts((prev) => [font, ...prev.filter((entry) => entry !== font)].slice(0, 6));
  }

  function setAccentWithRecent(accent: UiPersonalization["accent"]) {
    onUpdate("accent", accent);
    setRecentAccents((prev) => [accent, ...prev.filter((entry) => entry !== accent)].slice(0, 6));
  }

  function applyFont<K extends "bodyFont" | "displayFont">(key: K, font: UiPersonalization[K]) {
    onUpdate(key, font);
    rememberFont(font);
  }

  const filteredBodyFonts = useMemo(
    () => CONTROL_GROUPS.bodyFont.filter((option) => {
      const label = FONT_LABELS[option].toLowerCase();
      const searchPass = !fontSearch.trim() || label.includes(fontSearch.toLowerCase());
      const categoryPass = fontCategory === "all" || FONT_CATEGORIES[option].includes(fontCategory);
      return searchPass && categoryPass;
    }),
    [fontCategory, fontSearch],
  );

  const filteredDisplayFonts = useMemo(
    () => CONTROL_GROUPS.displayFont.filter((option) => {
      const label = FONT_LABELS[option].toLowerCase();
      const searchPass = !fontSearch.trim() || label.includes(fontSearch.toLowerCase());
      const categoryPass = fontCategory === "all" || FONT_CATEGORIES[option].includes(fontCategory);
      return searchPass && categoryPass;
    }),
    [fontCategory, fontSearch],
  );

  function resetSection(section: "typography" | "colors" | "surfaces" | "effects") {
    if (!onApplyPatch) return;
    if (section === "typography") {
      onApplyPatch({
        bodyFont: DEFAULT_UI_PERSONALIZATION.bodyFont,
        displayFont: DEFAULT_UI_PERSONALIZATION.displayFont,
        textScale: DEFAULT_UI_PERSONALIZATION.textScale,
        displayTextStyle: DEFAULT_UI_PERSONALIZATION.displayTextStyle,
      });
      return;
    }
    if (section === "colors") {
      onApplyPatch({
        theme: DEFAULT_UI_PERSONALIZATION.theme,
        accent: DEFAULT_UI_PERSONALIZATION.accent,
        intensity: DEFAULT_UI_PERSONALIZATION.intensity,
        chartStyle: DEFAULT_UI_PERSONALIZATION.chartStyle,
      });
      return;
    }
    if (section === "surfaces") {
      onApplyPatch({
        surfaceStyle: DEFAULT_UI_PERSONALIZATION.surfaceStyle,
        density: DEFAULT_UI_PERSONALIZATION.density,
        radius: DEFAULT_UI_PERSONALIZATION.radius,
        sidebarStyle: DEFAULT_UI_PERSONALIZATION.sidebarStyle,
        cardEmphasis: DEFAULT_UI_PERSONALIZATION.cardEmphasis,
        panelTint: DEFAULT_UI_PERSONALIZATION.panelTint,
      });
      return;
    }
    onApplyPatch({
      glowLevel: DEFAULT_UI_PERSONALIZATION.glowLevel,
      motionLevel: DEFAULT_UI_PERSONALIZATION.motionLevel,
    });
  }

  return (
    <div className={`space-y-5 ${className ?? ""}`.trim()}>
      <div className="themed-surface settings-card p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">Live summary</p>
            <p className="text-sm font-medium">{summaryLine}</p>
          </div>
          <div className="flex gap-2 text-xs">
            {["typography", "colors", "surfaces", "effects"].map((section) => (
              <Button key={section} variant="ghost" size="sm" onClick={() => resetSection(section as "typography" | "colors" | "surfaces" | "effects")}>
                <span className="inline-flex items-center gap-1"><RotateCcw className="h-3.5 w-3.5" />Reset {section}</span>
              </Button>
            ))}
          </div>
        </div>
        <p className="text-xs text-[var(--muted)]">Typography preview · EN + BG</p>
        <h2 className="display-styled type-display text-3xl font-semibold">Turrex Signal Matrix</h2>
        <h3 className="display-styled type-display text-2xl font-semibold">Следващата песен е тук</h3>
      </div>

      <div className="themed-surface-subtle settings-card p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {PREVIEW_SURFACES.map((surface) => (
            <button key={surface.key} type="button" className={`selectable-card rounded-full border px-2.5 py-1 text-xs ${selectedSurface === surface.key ? "themed-selected" : "border-[var(--border)]"}`} onClick={() => setSelectedSurface(surface.key)}>
              {surface.label}
            </button>
          ))}
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
          {selectedSurface === "home-card" ? <div><p className="text-xs text-[var(--muted)]">For you</p><p className="display-styled type-display text-lg font-semibold">Late Night Discovery</p><p className="text-sm text-[var(--muted)]">A fresh blend from your recent taste shifts.</p></div> : null}
          {selectedSurface === "song-row" ? <div className="flex items-center justify-between"><div><p className="font-medium">Blinding Lights</p><p className="text-xs text-[var(--muted)]">The Weeknd · Synthwave Essentials</p></div><span className="rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-2 py-0.5 text-xs">3:21</span></div> : null}
          {selectedSurface === "assistant" ? <div className="rounded-lg border border-[var(--accent-border)] bg-[var(--accent-soft)] p-3"><p className="text-xs text-[var(--muted)]">Assistant</p><p className="text-sm">I noticed your energy is rising tonight. Want a bolder mix?</p></div> : null}
          {selectedSurface === "playlist" ? <div className="space-y-2"><p className="display-styled type-display text-base font-semibold">City Pulse</p><p className="text-xs text-[var(--muted)]">24 songs · updated today</p><div className="h-14 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)]" /></div> : null}
          {selectedSurface === "profile" ? <div><p className="display-styled type-display text-xl font-semibold">Turrex Profile</p><p className="text-sm text-[var(--muted)]">Top lane: discovery · Accent confidence: vivid</p></div> : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="themed-surface-subtle settings-card p-4 space-y-3 border-[var(--accent-border)]/50">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => onUpdate("theme", resolveTheme(ui.theme) === "dark" ? "light" : "dark")}>
              {resolveTheme(ui.theme) === "dark" ? <span className="inline-flex items-center gap-2"><Sun className="w-4 h-4" />Light</span> : <span className="inline-flex items-center gap-2"><Moon className="w-4 h-4" />Dark</span>}
            </Button>
            <span className="text-xs text-[var(--muted)]">Mode: {ui.theme}</span>
          </div>
          <p className="text-sm font-medium">Accent color</p>
          <div className="flex flex-wrap gap-1.5">{SUPPORTED_ACCENTS.map((preset) => <button key={preset} type="button" onClick={() => setAccentWithRecent(preset)} aria-pressed={ui.accent === preset} className={`selectable-card rounded-full border px-2.5 py-1 text-xs transition ${ui.accent === preset ? "themed-selected" : "border-[var(--border)]"}`}><span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ACCENT_TOKENS[preset].accent }} />{preset}</span></button>)}</div>
          {recentAccents.length ? <div className="pt-1"><p className="text-xs text-[var(--muted)]">Recent accents</p><div className="mt-1 flex flex-wrap gap-1.5">{recentAccents.map((accent) => <button key={accent} type="button" className="rounded-full border border-[var(--border)] px-2 py-0.5 text-xs" onClick={() => onUpdate("accent", accent)}>{accent}</button>)}</div></div> : null}
        </div>

        <div className="themed-surface-subtle settings-card p-4 space-y-3">
          <p className="text-sm font-medium">Classic defaults</p>
          <div className="grid grid-cols-2 gap-2">
            {(["Stock Clean", "AI Minimal"] as const).map((name) => {
              const preset = UI_PRESETS[name];
              return <button key={name} type="button" className="selectable-card rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-2 text-left text-xs transition" onClick={() => onApplyPreset(name)}><p className="font-semibold">{name}</p><p className="text-[var(--muted)]">{preset.bodyFont} · {preset.displayFont}</p></button>;
            })}
          </div>
          <p className="text-sm font-medium">Curated presets</p>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(UI_PRESETS).filter(([name]) => name !== "Stock Clean" && name !== "AI Minimal").map(([name, preset]) => <button key={name} type="button" className="selectable-card rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-2 text-left text-xs transition" onClick={() => onApplyPreset(name)}><p className="font-semibold">{name}</p><p className="text-[var(--muted)]">{preset.accent} · {preset.surfaceStyle}</p></button>)}
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 text-sm">
        {baseControlKeys.map((key) => (
          <div key={key} className="themed-surface-subtle settings-card p-3">
            <p className="mb-2 capitalize">{key.replace(/([A-Z])/g, " $1")}</p>
            <div className="flex flex-wrap gap-2">
              {CONTROL_GROUPS[key].map((option) => {
                const active = String(ui[key as keyof UiPersonalization]) === option;
                return <button key={option} type="button" onClick={() => onUpdate(key as keyof UiPersonalization, option as never)} className={`selectable-card rounded-[var(--radius-sm)] border px-2.5 py-1 text-xs transition ${active ? "themed-selected shadow-[0_0_0_1px_var(--accent-border)]" : "border-[var(--border)]"}`}>{option}</button>;
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="themed-panel-surface-subtle settings-card p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative max-w-sm flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
            <Input className="pl-9" value={fontSearch} onChange={(event) => setFontSearch(event.target.value)} placeholder="Search fonts" />
          </div>
          {(["all", "clean", "tech", "gothic", "handwritten", "poster", "playful"] as const).map((category) => (
            <button key={category} type="button" onClick={() => setFontCategory(category)} className={`rounded-full border px-2 py-1 text-xs ${fontCategory === category ? "themed-selected" : "border-[var(--border)]"}`}>{category}</button>
          ))}
        </div>
        {recentFonts.length ? <div><p className="text-xs text-[var(--muted)]">Recent fonts</p><div className="mt-1 flex flex-wrap gap-1.5">{recentFonts.map((font) => <button key={font} type="button" className="rounded-full border border-[var(--border)] px-2 py-0.5 text-xs" onClick={() => (CONTROL_GROUPS.bodyFont.includes(font as BodyFont) ? applyFont("bodyFont", font as BodyFont) : applyFont("displayFont", font as DisplayFont))}>{FONT_LABELS[font]}</button>)}</div></div> : null}
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <div className="themed-panel-surface-subtle settings-card p-4 space-y-3">
          <p className="text-sm font-semibold">Body font · UI text</p>
          <div className="grid max-h-56 gap-2 overflow-auto pr-1">
            {filteredBodyFonts.map((option) => {
              const active = ui.bodyFont === option;
              return <button key={option} type="button" onClick={() => applyFont("bodyFont", option)} className={`selectable-card rounded-[var(--radius-sm)] border px-3 py-2 text-left transition ${active ? "themed-selected" : "border-[var(--border)]"}`}>
                <p className="text-sm font-semibold">{FONT_LABELS[option]}</p>
              </button>;
            })}
          </div>
        </div>
        <div className="themed-panel-surface-subtle settings-card p-4 space-y-3">
          <p className="text-sm font-semibold">Display font · branded headings</p>
          <div className="grid max-h-56 gap-2 overflow-auto pr-1">
            {filteredDisplayFonts.map((option) => {
              const active = ui.displayFont === option;
              return <button key={option} type="button" onClick={() => applyFont("displayFont", option)} className={`selectable-card rounded-[var(--radius-sm)] border px-3 py-2 text-left transition ${active ? "themed-selected" : "border-[var(--border)]"}`}>
                <p className="text-sm font-semibold">{FONT_LABELS[option]}</p>
              </button>;
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
