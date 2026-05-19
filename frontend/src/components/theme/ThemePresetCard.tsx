'use client';

import React from "react";
import { Check } from "../../../lucide-react";
import { getThemePreviewTokens, type ThemePresetDefinition } from "../../../lib/ThemeContext";

type Props = {
  preset: ThemePresetDefinition;
  selected: boolean;
  saved?: boolean;
  disabled?: boolean;
  onSelect: (presetId: string) => void;
};

export const THEME_PRESET_CARD_CLASS =
  "theme-preset-card group flex h-[22rem] w-full max-w-[12rem] min-w-0 flex-col overflow-hidden rounded-xl border p-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-70";

export default function ThemePresetCard({ preset, selected, saved = false, disabled = false, onSelect }: Props) {
  const tokens = getThemePreviewTokens(preset);
  const previewId = `theme-preset-${preset.id.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <button
      type="button"
      id={previewId}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={`${selected ? "Selected" : "Preview"} ${preset.name} theme preset`}
      onClick={() => onSelect(preset.id)}
      className={THEME_PRESET_CARD_CLASS}
      style={{
        background: `linear-gradient(180deg, ${tokens.background}, ${tokens.backgroundAlt})`,
        borderColor: selected ? tokens.accentBorder : tokens.border,
        boxShadow: selected ? `0 0 0 1px ${tokens.accentBorder}, 0 18px 36px ${tokens.accentSoft}` : "none",
        color: tokens.text,
        outlineColor: tokens.accent,
      }}
    >
      <div
        className="flex h-36 shrink-0 flex-col overflow-hidden rounded-lg border"
        style={{ borderColor: tokens.border, background: tokens.surface }}
        aria-hidden="true"
      >
        <div
          className="flex h-8 items-center justify-between border-b px-2"
          style={{ borderColor: tokens.border, background: tokens.surfaceElevated }}
        >
          <div className="flex gap-1">
            {[tokens.accent, tokens.accent2, tokens.muted].map((color) => (
              <span key={color} className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
            ))}
          </div>
          <span className="h-2 w-10 rounded-full" style={{ backgroundColor: tokens.accentSoft }} />
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-[2.1rem_minmax(0,1fr)]">
          <div className="space-y-2 border-r p-2" style={{ borderColor: tokens.border, background: tokens.surfaceSubtle }}>
            <span className="block h-5 rounded-md" style={{ backgroundColor: tokens.accent }} />
            <span className="block h-2 rounded-full" style={{ backgroundColor: tokens.accentSoft }} />
            <span className="block h-2 rounded-full" style={{ backgroundColor: tokens.border }} />
          </div>
          <div className="min-w-0 space-y-2 p-2">
            <span className="block h-3 w-3/4 rounded-full" style={{ backgroundColor: tokens.text }} />
            <span className="block h-2 w-full rounded-full" style={{ backgroundColor: tokens.muted }} />
            <div className="grid grid-cols-2 gap-1.5">
              <span className="h-9 rounded-md border" style={{ borderColor: tokens.border, background: tokens.surfaceElevated }} />
              <span className="h-9 rounded-md border" style={{ borderColor: tokens.accentBorder, background: tokens.accentSoft }} />
            </div>
            <span className="block h-5 w-2/3 rounded-md" style={{ backgroundColor: tokens.accent2 }} />
          </div>
        </div>
      </div>

      <div className="mt-3 min-w-0 flex-1">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <p className="truncate text-sm font-semibold" title={preset.name}>{preset.name}</p>
          {selected ? (
            <span
              className="grid h-5 w-5 shrink-0 place-items-center rounded-full border"
              style={{ borderColor: tokens.accentBorder, background: tokens.accentSoft, color: tokens.accent }}
              aria-hidden="true"
            >
              <Check className="h-3.5 w-3.5" />
            </span>
          ) : null}
        </div>
        <p className="mt-1 truncate text-[11px]" style={{ color: tokens.muted }}>{preset.category}</p>
        <p className="mt-2 h-10 overflow-hidden text-xs leading-5" style={{ color: tokens.muted }}>{preset.description}</p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-1.5 text-[10px]" style={{ color: tokens.muted }}>
        <span className="truncate rounded-full border px-2 py-1" style={{ borderColor: tokens.border, background: tokens.surfaceSubtle }}>{preset.personalization.accent}</span>
        <span className="truncate rounded-full border px-2 py-1" style={{ borderColor: tokens.border, background: tokens.surfaceSubtle }}>{preset.personalization.surfaceStyle}</span>
      </div>
      {saved ? <p className="mt-2 text-[11px] font-medium" style={{ color: tokens.accent }}>Saved theme</p> : null}
    </button>
  );
}
