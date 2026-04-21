'use client';

import { Moon, Sun } from "../../../lucide-react";
import { UI_PRESETS, resolveTheme, type AccentIntensity, type BodyFont, type CardEmphasis, type ChartStyle, type DensityMode, type DisplayFont, type DisplayTextStyle, type GlowLevel, type PanelTint, type RadiusMode, type SidebarStyle, type SurfaceStyle, type TextScale, type UiPersonalization } from "../../../lib/ThemeContext";
import { ACCENT_TOKENS, SUPPORTED_ACCENTS } from "../../../lib/themePresets";
import { BODY_FONT_OPTIONS, DISPLAY_FONT_OPTIONS, DISPLAY_TEXT_STYLE_OPTIONS, TEXT_SCALE_OPTIONS } from "../../../lib/typographyConfig";
import { Button } from "../ui/Button";

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

type Props = {
  ui: UiPersonalization;
  onUpdate: <K extends keyof UiPersonalization>(key: K, value: UiPersonalization[K]) => void;
  onApplyPreset: (presetName: string) => void;
  className?: string;
};

export default function ThemeStudioControls({ ui, onUpdate, onApplyPreset, className }: Props) {
  const baseControlKeys = (Object.keys(CONTROL_GROUPS) as Array<keyof typeof CONTROL_GROUPS>).filter((key) => key !== "bodyFont" && key !== "displayFont");

  return (
    <div className={`space-y-5 ${className ?? ""}`.trim()}>
      <div className="themed-surface settings-card p-4 space-y-3">
        <p className="text-xs text-[var(--muted)]">Typography preview · EN + BG</p>
        <h2 className="display-styled type-display text-3xl font-semibold">Trackly Signal Matrix</h2>
        <h3 className="display-styled type-display text-2xl font-semibold">Следващата песен е тук</h3>
        <p className="text-sm text-[var(--muted)]">English preview paragraph: expressive headings + readable UI text for real product usage.</p>
        <p className="text-sm text-[var(--muted)]">Български преглед: четим основен текст и акцентни заглавия за по-живо изживяване.</p>
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
          <div className="flex flex-wrap gap-1.5">{SUPPORTED_ACCENTS.map((preset) => <button key={preset} type="button" onClick={() => onUpdate("accent", preset)} aria-pressed={ui.accent === preset} className={`selectable-card rounded-full border px-2.5 py-1 text-xs transition ${ui.accent === preset ? "themed-selected" : "border-[var(--border)]"}`}><span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ACCENT_TOKENS[preset].accent }} />{preset}</span></button>)}</div>
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

      <div className="grid gap-3 xl:grid-cols-2">
        <div className="themed-panel-surface-subtle settings-card p-4 space-y-3">
          <p className="text-sm font-semibold">Body font · UI text</p>
          <p className="text-xs text-[var(--muted)]">Applies to buttons, cards, forms, tabs, dropdowns, and paragraphs.</p>
          <div className="grid max-h-56 gap-2 overflow-auto pr-1">
            {CONTROL_GROUPS.bodyFont.map((option) => {
              const active = ui.bodyFont === option;
              return <button key={option} type="button" onClick={() => onUpdate("bodyFont", option)} className={`selectable-card rounded-[var(--radius-sm)] border px-3 py-2 text-left transition ${active ? "themed-selected" : "border-[var(--border)]"}`}>
                <p className="text-sm font-semibold">{FONT_LABELS[option]}</p>
                <p className="mt-1 text-xs text-[var(--muted)]" style={{ fontFamily: option === "system" ? "system-ui, -apple-system, Segoe UI, sans-serif" : `var(--font-${option})` }}>EN + BG preview · Музиката е емоция</p>
              </button>;
            })}
          </div>
        </div>
        <div className="themed-panel-surface-subtle settings-card p-4 space-y-3">
          <p className="text-sm font-semibold">Display font · branded headings</p>
          <p className="text-xs text-[var(--muted)]">Applies to display text surfaces and expressive titles.</p>
          <div className="grid max-h-56 gap-2 overflow-auto pr-1">
            {CONTROL_GROUPS.displayFont.map((option) => {
              const active = ui.displayFont === option;
              return <button key={option} type="button" onClick={() => onUpdate("displayFont", option)} className={`selectable-card rounded-[var(--radius-sm)] border px-3 py-2 text-left transition ${active ? "themed-selected" : "border-[var(--border)]"}`}>
                <p className="text-sm font-semibold">{FONT_LABELS[option]}</p>
                <p className="display-styled type-display mt-1 text-xs" style={{ fontFamily: `var(--font-${option})` }}>Trackly Signal Matrix</p>
              </button>;
            })}
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="themed-surface settings-card p-3"><p className="text-xs text-[var(--muted)] mb-2">Buttons / tabs</p><div className="flex gap-2"><Button variant="primary" size="sm">Primary</Button><Button variant="secondary" size="sm">Secondary</Button></div></div>
        <div className="themed-surface settings-card p-3"><p className="text-xs text-[var(--muted)] mb-2">Selected row</p><div className="rounded-[var(--radius-sm)] border themed-selected px-3 py-2 text-sm">Now active selection</div></div>
        <div className="themed-surface settings-card p-3"><p className="text-xs text-[var(--muted)] mb-2">Chart palette</p><div className="flex gap-1">{["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"].map((color) => <span key={color} className="h-8 flex-1 rounded" style={{ background: color }} />)}</div></div><div className="themed-surface settings-card p-3"><p className="text-xs text-[var(--muted)] mb-2">Card emphasis</p><div className="rounded-[var(--radius-sm)] border border-[var(--card-border,var(--border))] bg-[var(--card-surface,var(--surface))] px-3 py-2 text-sm">Preview card style</div></div>
      </div>
    </div>
  );
}
