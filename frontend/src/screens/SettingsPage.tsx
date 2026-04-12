'use client';

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { scopedKey, useProfile } from "../../lib/ProfileContext";
import { normalizeTrackKey } from "../../lib/dedupe";
import { Download, FileSpreadsheet, Moon, Sun, Trash2, Upload } from "../../lucide-react";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import Modal from "../components/ui/Modal";
import { useUser } from "../context/UserContext";
import { useLanguage } from "../../lib/LanguageContext";
import { t } from "../../lib/translations";
import { ACCENT_TOKENS, type AccentPreset, useTheme, type DensityMode } from "../../lib/ThemeContext";
import { exportLibraryAsJSON, exportLibraryAsCSV, importLibraryFromJSON, LIBRARY_EXPORT_VERSION } from "../lib/libraryExport";
import type { Playlist } from "../../features/library/types";

function dedupeByTrack<T extends { title?: string; artist?: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = normalizeTrackKey(item.title ?? "", item.artist ?? "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default function SettingsPage() {
  const [libraryData, setLibraryData] = useState<{ favorites: unknown[]; history: unknown[]; playlists: Playlist[] }>(() => ({ favorites: [], history: [], playlists: [] }));
  const [importSummary, setImportSummary] = useState<string | null>(null);
  const [exportSummary, setExportSummary] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [processingStep, setProcessingStep] = useState<string | null>(null);
  const [assistantHints, setAssistantHints] = useState(true);
  const { profile } = useProfile();
  const { user, preferences, updateProfile, changePassword, setPreferences, deleteAccount, isAuthenticated, favorites, history, addFavorite, addToHistory } = useUser();
  const { language } = useLanguage();
  const { theme, toggleTheme, accent, setAccent, density, setDensity } = useTheme();

  const [displayName, setDisplayName] = useState(user?.username ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });
  const [show, setShow] = useState({ current: false, next: false, confirm: false });
  const [confirmText, setConfirmText] = useState("");
  const [showDangerModal, setShowDangerModal] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  async function handleDeleteAccount() { await deleteAccount(); }

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
    await runProgressSteps([
      language === "bg" ? "Подготвям архив..." : "Preparing backup...",
      language === "bg" ? "Генерирам отчет..." : "Generating report...",
      language === "bg" ? "Пакетирам данните..." : "Packaging data...",
    ]);
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
    await runProgressSteps([
      language === "bg" ? "Чета файла..." : "Reading file...",
      language === "bg" ? "Валидирам схемата..." : "Checking schema...",
      language === "bg" ? "Импортирам записи..." : "Importing items...",
      language === "bg" ? "Премахвам дубликати..." : "Deduplicating...",
      language === "bg" ? "Финализирам..." : "Finalizing...",
    ]);
    try {
      const payload = await importLibraryFromJSON(file);
      const favoritesToImport = dedupeByTrack(payload.data.favorites ?? []);
      const historyToImport = dedupeByTrack(payload.data.history ?? []);
      const favoritesSkipped = Math.max(0, (payload.data.favorites ?? []).length - favoritesToImport.length);
      const historySkipped = Math.max(0, (payload.data.history ?? []).length - historyToImport.length);
      for (const item of historyToImport) await addToHistory(item);
      for (const fav of favoritesToImport) await addFavorite({ title: fav.title, artist: fav.artist, album: fav.album, coverUrl: fav.coverUrl });
      const playlistsToImport = Array.isArray(payload.data.playlists) ? payload.data.playlists : [];
      const invalidCount = [payload.data.favorites?.length ?? 0, payload.data.history?.length ?? 0].reduce((sum, current) => sum + current, 0)
        - (favoritesToImport.length + historyToImport.length);
      if (!isAuthenticated) window.localStorage.setItem(scopedKey("ponotai.library.playlists", profile.id), JSON.stringify(playlistsToImport));
      setImportSummary(`${language === "bg" ? "Импортирани" : "Imported"}: ${favoritesToImport.length} favorites, ${historyToImport.length} history, ${playlistsToImport.length} playlists · ${language === "bg" ? "пропуснати/дубликати" : "skipped/duplicates"}: ${favoritesSkipped + historySkipped} · ${language === "bg" ? "невалидни" : "invalid"}: ${Math.max(0, invalidCount)}.`);
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
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6 pb-[calc(var(--layout-bottom-offset)+24px)]">
      <h1 className="text-3xl font-bold tracking-tight">{t("nav_settings", language)}</h1>

      <Card className="p-6 space-y-4">
        <h2 className="text-xl font-semibold">Account</h2>
        {saveError ? <p className="text-sm text-danger">{saveError}</p> : null}
        <div>
          <label className="text-sm font-medium mb-1 block">Display name</label>
          <div className="flex flex-col gap-2 sm:flex-row"><Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} /><Button variant="primary" onClick={handleSaveName}>Save</Button></div>
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block">Email</label>
          <div className="flex flex-col gap-2 sm:flex-row"><Input value={email} onChange={(e) => setEmail(e.target.value)} /><Button variant="primary" onClick={handleSaveEmail}>Save</Button></div>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="text-xl font-semibold">{t("settings_appearance", language)}</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={toggleTheme}>{theme === "dark" ? <span className="inline-flex items-center gap-2"><Sun className="w-4 h-4" />{t("theme_light", language)}</span> : <span className="inline-flex items-center gap-2"><Moon className="w-4 h-4" />{t("theme_dark", language)}</span>}</Button>
          <span className="text-sm text-[var(--muted)]">{t("settings_current_theme", language)}: {theme}</span>
        </div>
        <div>
          <p className="text-sm font-medium">{t("settings_accent_color", language)}</p>
          <div className="mt-2 flex flex-wrap gap-2">{(Object.keys(ACCENT_TOKENS) as AccentPreset[]).map((preset) => <button key={preset} onClick={() => setAccent(preset)} className="rounded-full border px-3 py-1.5 text-sm" style={{ borderColor: accent === preset ? "var(--accent)" : "var(--border)" }}>{preset}</button>)}</div>
        </div>
        <div>
          <p className="text-sm font-medium">{t("settings_density", language)}</p>
          <div className="mt-2 flex gap-2"><Button variant={density === "comfortable" ? "primary" : "secondary"} onClick={() => setDensity("comfortable" as DensityMode)}>{t("settings_density_comfortable", language)}</Button><Button variant={density === "compact" ? "primary" : "secondary"} onClick={() => setDensity("compact" as DensityMode)}>{t("settings_density_compact", language)}</Button></div>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="text-xl font-semibold">{t("settings_assistant_behavior", language)}</h2>
        <div className="flex items-center justify-between rounded-lg border border-[var(--border)] p-3">
          <div><p className="font-medium">{t("settings_show_ai_hints", language)}</p><p className="text-sm text-[var(--muted)]">{t("settings_show_ai_hints_desc", language)}</p></div>
          <Button variant="secondary" onClick={() => setAssistantHintsPref(!assistantHints)}>{assistantHints ? t("settings_on", language) : t("settings_off", language)}</Button>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-[var(--border)] p-3"><p className="font-medium">{t("settings_notifications", language)}</p><Button variant="secondary" onClick={() => setPreferences({ notifications: !preferences.notifications })}>{preferences.notifications ? t("settings_enabled", language) : t("settings_disabled", language)}</Button></div>
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="text-xl font-semibold">Security</h2>
        {passwordError ? <p className="text-sm text-danger">{passwordError}</p> : null}
        {(["current", "next", "confirm"] as const).map((key) => (
          <div key={key}><label className="text-sm font-medium mb-1 block capitalize">{key} password</label><div className="flex gap-2"><Input type={show[key] ? "text" : "password"} value={passwords[key]} disabled={!isAuthenticated} onChange={(e) => setPasswords((p) => ({ ...p, [key]: e.target.value }))} /><Button variant="secondary" onClick={() => setShow((prev) => ({ ...prev, [key]: !prev[key] }))}>{show[key] ? "Hide" : "Show"}</Button></div></div>
        ))}
        {isAuthenticated ? <Button variant="primary" onClick={handleChangePassword}>Update Password</Button> : null}
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="text-xl font-semibold">Data Management</h2>
        <p className="text-xs text-[var(--muted)]">{language === "bg" ? "Виж документацията за архивиране и възстановяване." : "See docs for backup and restore guidance."} <Link href="/docs" className="underline">{language === "bg" ? "Отвори docs" : "Open docs"}</Link></p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="secondary" onClick={() => void handleExportJSON()} className="flex-1" disabled={isExporting || isImporting}><span className="inline-flex items-center gap-2"><Download className="w-4 h-4" />Export JSON</span></Button>
          <Button variant="secondary" onClick={handleExportCSV} className="flex-1" disabled={isExporting || isImporting}><span className="inline-flex items-center gap-2"><FileSpreadsheet className="w-4 h-4" />Export CSV</span></Button>
        </div>
        <input ref={fileInputRef} type="file" accept=".json" onChange={(e) => { const file = e.target.files?.[0]; if (file) void handleImport(file); }} className="hidden" />
        <Button variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={isImporting || isExporting}><span className="inline-flex items-center gap-2"><Upload className="w-4 h-4" />Import JSON</span></Button>
        {(isImporting || isExporting || processingStep) ? <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-3 text-sm">{processingStep ?? (language === "bg" ? "Обработка..." : "Processing...")}</div> : null}
        {importSummary ? <p className="text-xs text-[var(--muted)]">{importSummary}</p> : null}
        {exportSummary ? <p className="text-xs text-[var(--muted)]">{exportSummary}</p> : null}
      </Card>

      <Card className="p-6 space-y-4" style={{ borderColor: "var(--color-danger, #ef4444)" }}>
        <h2 className="text-xl font-semibold">Danger Zone</h2>
        <Button variant="danger" onClick={() => setShowDangerModal(true)}><span className="inline-flex items-center gap-2"><Trash2 className="w-4 h-4 text-white" />Delete Account</span></Button>
      </Card>

      {showDangerModal ? (
        <Modal isOpen={showDangerModal} onClose={() => setShowDangerModal(false)} title="Type your username to confirm" maxWidth="520px">
          <div className="space-y-4">
            <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={user?.username ?? "username"} />
            <div className="flex gap-2 justify-end"><Button variant="ghost" onClick={() => setShowDangerModal(false)}>Cancel</Button><Button variant="danger" disabled={!canDelete} onClick={handleDeleteAccount}>Confirm delete</Button></div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
