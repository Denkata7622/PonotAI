'use client';

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { scopedKey, useProfile } from "../../lib/ProfileContext";
import { normalizeTrackKey } from "../../lib/dedupe";
import { Download, FileSpreadsheet, Moon, Sparkles, Sun, Trash2, Upload } from "../../lucide-react";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import Modal from "../components/ui/Modal";
import { useUser } from "../context/UserContext";
import { useLanguage } from "../../lib/LanguageContext";
import { t } from "../../lib/translations";
import { useTheme, UI_PRESETS, type DensityMode, type RadiusMode, type SurfaceStyle, type AccentIntensity, type ChartStyle, type SidebarStyle, type MotionLevel, type CardEmphasis, type FontFamily, type TextScale, type GlowLevel, type PanelTint } from "../../lib/ThemeContext";
import { ACCENT_TOKENS, SUPPORTED_ACCENTS } from "../../lib/themePresets";
import { exportLibraryAsJSON, exportLibraryAsCSV, importLibraryFromJSON, LIBRARY_EXPORT_VERSION } from "../lib/libraryExport";
import type { Playlist } from "../../features/library/types";
import { syncLibraryState } from "../../features/library/api";

function dedupeByTrack<T extends { title?: string; artist?: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = normalizeTrackKey(item.title ?? "", item.artist ?? "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const CONTROL_GROUPS = {
  intensity: ["subtle", "balanced", "vivid"] as AccentIntensity[],
  surfaceStyle: ["flat", "soft", "elevated"] as SurfaceStyle[],
  radius: ["compact", "default", "rounded"] as RadiusMode[],
  density: ["compact", "default", "comfortable"] as DensityMode[],
  chartStyle: ["neutral", "accent-led", "multicolor"] as ChartStyle[],
  sidebarStyle: ["standard", "tinted", "elevated"] as SidebarStyle[],
  motionLevel: ["full", "reduced", "minimal"] as MotionLevel[],
  cardEmphasis: ["standard", "accented", "tinted"] as CardEmphasis[],
  fontFamily: ["inter", "system", "manrope", "outfit", "dm-sans", "sora", "plus-jakarta-sans", "poppins", "nunito", "ibm-plex-sans"] as FontFamily[],
  textScale: ["sm", "md", "lg"] as TextScale[],
  glowLevel: ["off", "low", "medium"] as GlowLevel[],
  panelTint: ["off", "subtle", "rich"] as PanelTint[],
} as const;

export default function SettingsPage() {
  const [libraryData, setLibraryData] = useState<{ favorites: unknown[]; history: unknown[]; playlists: Playlist[] }>(() => ({ favorites: [], history: [], playlists: [] }));
  const [importSummary, setImportSummary] = useState<string | null>(null);
  const [exportSummary, setExportSummary] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [processingStep, setProcessingStep] = useState<string | null>(null);
  const [assistantHints, setAssistantHints] = useState(true);
  const { profile } = useProfile();
  const { user, updateProfile, changePassword, deleteAccount, isAuthenticated, favorites, history, addFavorite, addToHistory } = useUser();
  const { language } = useLanguage();
  const { theme, toggleTheme, accent, density, intensity, surfaceStyle, radius, chartStyle, sidebarStyle, motionLevel, cardEmphasis, fontFamily, textScale, glowLevel, panelTint, applyPersonalization, updateUiSetting } = useTheme();

  const [displayName, setDisplayName] = useState(user?.username ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });
  const [show, setShow] = useState({ current: false, next: false, confirm: false });
  const [confirmText, setConfirmText] = useState("");
  const [showDangerModal, setShowDangerModal] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const controlSetters = {
    intensity: (value: AccentIntensity) => updateUiSetting("intensity", value),
    surfaceStyle: (value: SurfaceStyle) => updateUiSetting("surfaceStyle", value),
    radius: (value: RadiusMode) => updateUiSetting("radius", value),
    density: (value: DensityMode) => updateUiSetting("density", value),
    chartStyle: (value: ChartStyle) => updateUiSetting("chartStyle", value),
    sidebarStyle: (value: SidebarStyle) => updateUiSetting("sidebarStyle", value),
    motionLevel: (value: MotionLevel) => updateUiSetting("motionLevel", value),
    cardEmphasis: (value: CardEmphasis) => updateUiSetting("cardEmphasis", value),
    fontFamily: (value: FontFamily) => updateUiSetting("fontFamily", value),
    textScale: (value: TextScale) => updateUiSetting("textScale", value),
    glowLevel: (value: GlowLevel) => updateUiSetting("glowLevel", value),
    panelTint: (value: PanelTint) => updateUiSetting("panelTint", value),
  } as const;

  useEffect(() => {
    try {
      const playlists = JSON.parse(window.localStorage.getItem(scopedKey("ponotai.library.playlists", profile.id)) ?? "[]") as Playlist[];
      setLibraryData({ favorites, history, playlists });
      setAssistantHints(window.localStorage.getItem("ponotai-assistant-hints") !== "off");
    } catch {
      setLibraryData({ favorites: [], history: [], playlists: [] });
    }
  }, [favorites, history, profile.id]);

  const canDelete = confirmText === (user?.username ?? "");

  async function handleSaveName() { try { if (isAuthenticated) await updateProfile({ username: displayName }); } catch (e) { setSaveError((e as Error).message); } }
  async function handleSaveEmail() { try { if (isAuthenticated) await updateProfile({ email }); } catch (e) { setSaveError((e as Error).message); } }

  async function handleChangePassword() {
    setPasswordError(null);
    if (passwords.next !== passwords.confirm) return setPasswordError("Passwords do not match");
    if (passwords.next.length < 8) return setPasswordError("New password must be at least 8 characters");
    try { await changePassword(passwords.current, passwords.next); setPasswords({ current: "", next: "", confirm: "" }); } catch (e) { setPasswordError((e as Error).message); }
  }

  function setAssistantHintsPref(next: boolean) {
    setAssistantHints(next);
    window.localStorage.setItem("ponotai-assistant-hints", next ? "on" : "off");
  }

  async function runProgressSteps(steps: string[], minDelay = 130) {
    for (const step of steps) {
      setProcessingStep(step);
      await new Promise((resolve) => window.setTimeout(resolve, minDelay));
    }
  }

  async function handleExportJSON() {
    setIsExporting(true);
    setExportSummary(null);
    await runProgressSteps([language === "bg" ? "Подготвям архив..." : "Preparing backup...", language === "bg" ? "Генерирам отчет..." : "Generating report...", language === "bg" ? "Пакетирам данните..." : "Packaging data..."]);
    const queueState = JSON.parse(window.localStorage.getItem("ponotai.queue.v1") ?? "{}") as { queue?: Array<{ track?: { title?: string; artist?: string; artworkUrl?: string; videoId?: string } }> };
    const exportedAt = new Date().toISOString();
    const payload = {
      version: LIBRARY_EXPORT_VERSION,
      exportedAt,
      app: "Trackly" as const,
      user: user ? { id: user.id, username: user.username, email: user.email } : null,
      data: {
        favorites: favorites ?? [],
        history: history ?? [],
        playlists: libraryData.playlists ?? [],
        queue: (queueState.queue ?? []).map((entry) => ({ title: entry.track?.title ?? "", artist: entry.track?.artist ?? "", artworkUrl: entry.track?.artworkUrl, videoId: entry.track?.videoId })).filter((entry) => entry.title && entry.artist),
        settings: { theme: window.localStorage.getItem("ponotai-theme"), language: window.localStorage.getItem("ponotai-language") },
      },
    };
    exportLibraryAsJSON(payload, user?.username || "guest");
    setExportSummary(`${language === "bg" ? "Архивът е готов" : "Backup ready"} · v${LIBRARY_EXPORT_VERSION} · ${new Date(exportedAt).toLocaleString()}`);
    setProcessingStep(language === "bg" ? "Изтеглянето е готово." : "Download is ready.");
    setIsExporting(false);
    window.setTimeout(() => setProcessingStep(null), 2600);
  }

  function handleExportCSV() { exportLibraryAsCSV(favorites, history, user?.username || "library"); }

  async function handleImport(file: File) {
    setIsImporting(true); setImportSummary(null);
    await runProgressSteps([language === "bg" ? "Чета файла..." : "Reading file...", language === "bg" ? "Валидирам схемата..." : "Checking schema...", language === "bg" ? "Импортирам записи..." : "Importing items...", language === "bg" ? "Премахвам дубликати..." : "Deduplicating...", language === "bg" ? "Финализирам..." : "Finalizing..."]);
    try {
      const payload = await importLibraryFromJSON(file);
      const favoritesToImport = dedupeByTrack(payload.data.favorites ?? []);
      const historyToImport = dedupeByTrack(payload.data.history ?? []);
      for (const item of historyToImport) await addToHistory(item);
      for (const fav of favoritesToImport) await addFavorite({ title: fav.title, artist: fav.artist, album: fav.album, coverUrl: fav.coverUrl });
      const playlistsToImport = Array.isArray(payload.data.playlists) ? payload.data.playlists : [];
      let importedPlaylistsCount = playlistsToImport.length;

      if (isAuthenticated) {
        const playlistsSynced = await syncLibraryState({ favorites: [], playlists: playlistsToImport });
        if (!playlistsSynced) {
          importedPlaylistsCount = 0;
        }
      } else {
        window.localStorage.setItem(scopedKey("ponotai.library.playlists", profile.id), JSON.stringify(playlistsToImport));
      }

      setImportSummary(`${language === "bg" ? "Импортирани" : "Imported"}: ${favoritesToImport.length} favorites, ${historyToImport.length} history, ${importedPlaylistsCount} playlists`);
      setProcessingStep(language === "bg" ? "Импортирането завърши успешно." : "Import completed successfully.");
    } catch (error) {
      setImportSummary((error as Error).message);
      setProcessingStep(language === "bg" ? "Импортирането е неуспешно." : "Import failed.");
    } finally {
      setIsImporting(false);
      window.setTimeout(() => setProcessingStep(null), 2600);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6 pb-[calc(var(--layout-bottom-offset)+24px)]">
      <h1 className="text-3xl font-bold tracking-tight">{t("nav_settings", language)}</h1>

      <Card variant="settings" className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-semibold">{t("settings_appearance", language)}</h2><p className="text-xs text-[var(--muted)]">Fine-tune visual behavior, structure, and interaction feedback.</p></div><span className="badge">Live preview</span></div>
        <p className="text-sm text-[var(--muted)]">Create a polished look with live controls and instant preview cards.</p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="themed-surface-subtle settings-card p-4 space-y-3 border-[var(--accent-border)]/50">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" onClick={toggleTheme}>{theme === "dark" ? <span className="inline-flex items-center gap-2"><Sun className="w-4 h-4" />{t("theme_light", language)}</span> : <span className="inline-flex items-center gap-2"><Moon className="w-4 h-4" />{t("theme_dark", language)}</span>}</Button>
              <span className="text-xs text-[var(--muted)]">Mode: {theme}</span>
            </div>
            <p className="text-sm font-medium">{t("settings_accent_color", language)}</p>
            <div className="flex flex-wrap gap-1.5">{SUPPORTED_ACCENTS.map((preset) => <button key={preset} type="button" onClick={() => updateUiSetting("accent", preset)} aria-pressed={accent === preset} className={`selectable-card rounded-full border px-2.5 py-1 text-xs transition ${accent === preset ? "themed-selected" : "border-[var(--border)]"}`}><span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ACCENT_TOKENS[preset].accent }} />{preset}</span></button>)}</div>
          </div>

          <div className="themed-surface-subtle settings-card p-4 space-y-3">
            <p className="text-sm font-medium">Classic defaults</p>
            <div className="grid grid-cols-2 gap-2">
              {(["Stock Light", "Stock Dark"] as const).map((name) => {
                const preset = UI_PRESETS[name];
                return <button key={name} type="button" className="selectable-card rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-2 text-left text-xs transition" onClick={() => applyPersonalization(preset)}><p className="font-semibold">{name}</p><p className="text-[var(--muted)]">{name === "Stock Light" ? (language === "bg" ? "Класически светъл" : "Classic default light") : (language === "bg" ? "Класически тъмен" : "Classic default dark")}</p></button>;
              })}
            </div>
            <p className="text-sm font-medium">Curated presets</p>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(UI_PRESETS).filter(([name]) => name !== "Stock Light" && name !== "Stock Dark").map(([name, preset]) => <button key={name} type="button" className="selectable-card rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-2 text-left text-xs transition" onClick={() => applyPersonalization(preset)}><p className="font-semibold">{name}</p><p className="text-[var(--muted)]">{preset.accent} · {preset.surfaceStyle}</p></button>)}
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 text-sm">
          {Object.entries(CONTROL_GROUPS).map(([key, options]) => (
            <div key={key} className="themed-surface-subtle settings-card p-3">
              <p className="mb-2 capitalize">{key.replace(/([A-Z])/g, " $1")}</p>
              <div className="flex flex-wrap gap-2">
                {options.map((option) => {
                  const active = String({ intensity, surfaceStyle, radius, density, chartStyle, sidebarStyle, motionLevel, cardEmphasis, fontFamily, textScale, glowLevel, panelTint }[key as keyof typeof CONTROL_GROUPS]) === option;
                  const onClick = () => {
                    const setter = controlSetters[key as keyof typeof controlSetters];
                    if (setter) setter(option as never);
                  };
                  return <button key={option} type="button" onClick={onClick} className={`selectable-card rounded-[var(--radius-sm)] border px-2.5 py-1 text-xs transition ${active ? "themed-selected shadow-[0_0_0_1px_var(--accent-border)]" : "border-[var(--border)]"}`}>{option}</button>;
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="themed-surface settings-card p-3"><p className="text-xs text-[var(--muted)] mb-2">Buttons / tabs</p><div className="flex gap-2"><Button variant="primary" size="sm">Primary</Button><Button variant="secondary" size="sm">Secondary</Button></div></div>
          <div className="themed-surface settings-card p-3"><p className="text-xs text-[var(--muted)] mb-2">Selected row</p><div className="rounded-[var(--radius-sm)] border themed-selected px-3 py-2 text-sm">Now active selection</div></div>
          <div className="themed-surface settings-card p-3"><p className="text-xs text-[var(--muted)] mb-2">Chart palette</p><div className="flex gap-1">{["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"].map((color) => <span key={color} className="h-8 flex-1 rounded" style={{ background: color }} />)}</div></div><div className="themed-surface settings-card p-3"><p className="text-xs text-[var(--muted)] mb-2">Card emphasis</p><div className="rounded-[var(--radius-sm)] border border-[var(--card-border,var(--border))] bg-[var(--card-surface,var(--surface))] px-3 py-2 text-sm">Preview card style</div></div>
        </div>
      </Card>

      <Card variant="settings" className="space-y-4">
        <h2 className="text-xl font-semibold">Account</h2>
        {saveError ? <p className="text-sm text-danger">{saveError}</p> : null}
        <div><label className="text-sm font-medium mb-1 block">Display name</label><div className="flex flex-col gap-2 sm:flex-row"><Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} /><Button variant="primary" onClick={handleSaveName}>Save</Button></div></div>
        <div><label className="text-sm font-medium mb-1 block">Email</label><div className="flex flex-col gap-2 sm:flex-row"><Input value={email} onChange={(e) => setEmail(e.target.value)} /><Button variant="primary" onClick={handleSaveEmail}>Save</Button></div></div>
      </Card>

      <Card variant="settings" className="space-y-4">
        <h2 className="text-xl font-semibold">{t("settings_assistant_behavior", language)}</h2>
        <div className="settings-card flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--border)] p-3"><div><p className="font-medium">{t("settings_show_ai_hints", language)}</p><p className="text-sm text-[var(--muted)]">{t("settings_show_ai_hints_desc", language)}</p></div><Button variant="secondary" onClick={() => setAssistantHintsPref(!assistantHints)}>{assistantHints ? t("settings_on", language) : t("settings_off", language)}</Button></div>
      </Card>

      <Card variant="settings" className="space-y-4">
        <h2 className="text-xl font-semibold">Data Management</h2>
        <p className="text-xs text-[var(--muted)]">{language === "bg" ? "Виж документацията за архивиране и възстановяване." : "See docs for backup and restore guidance."} <Link href="/docs" className="themed-link underline">{language === "bg" ? "Отвори docs" : "Open docs"}</Link></p>
        <div className="flex flex-col gap-2 sm:flex-row"><Button variant="secondary" onClick={() => void handleExportJSON()} className="flex-1" disabled={isExporting || isImporting}><span className="inline-flex items-center gap-2"><Download className="w-4 h-4" />Export JSON</span></Button><Button variant="secondary" onClick={handleExportCSV} className="flex-1" disabled={isExporting || isImporting}><span className="inline-flex items-center gap-2"><FileSpreadsheet className="w-4 h-4" />Export CSV</span></Button></div>
        <input ref={fileInputRef} type="file" accept=".json" onChange={(e) => { const file = e.target.files?.[0]; if (file) void handleImport(file); }} className="hidden" />
        <Button variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={isImporting || isExporting}><span className="inline-flex items-center gap-2"><Upload className="w-4 h-4" />Import JSON</span></Button>
        {(isImporting || isExporting || processingStep) ? <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-3 text-sm">{processingStep ?? (language === "bg" ? "Обработка..." : "Processing...")}</div> : null}
        {importSummary ? <p className="text-xs text-[var(--muted)]">{importSummary}</p> : null}
        {exportSummary ? <p className="text-xs text-[var(--muted)]">{exportSummary}</p> : null}
      </Card>

      <Card variant="settings" className="danger-zone-card space-y-4">
        <h2 className="text-xl font-semibold status-danger">Danger Zone</h2>
        <Button variant="danger" onClick={() => setShowDangerModal(true)}><span className="inline-flex items-center gap-2"><Trash2 className="w-4 h-4 text-white" />Delete Account</span></Button>
      </Card>

      {showDangerModal ? <Modal isOpen={showDangerModal} onClose={() => setShowDangerModal(false)} title="Type your username to confirm" maxWidth="520px"><div className="space-y-4"><Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={user?.username ?? "username"} /><div className="flex gap-2 justify-end"><Button variant="ghost" onClick={() => setShowDangerModal(false)}>Cancel</Button><Button variant="danger" disabled={!canDelete} onClick={deleteAccount}>Confirm delete</Button></div></div></Modal> : null}
    </div>
  );
}
