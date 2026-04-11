'use client';

import { useEffect, useRef, useState } from "react";
import { scopedKey, useProfile } from "../../lib/ProfileContext";
import { normalizeTrackKey } from "../../lib/dedupe";
import { Download, FileSpreadsheet, Moon, Sun, Trash2, Upload } from "../../lucide-react";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import Modal from "../components/ui/Modal";
import { useUser } from "../context/UserContext";
import { useTheme } from "../../lib/ThemeContext";
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
  const [isImporting, setIsImporting] = useState(false);
  const { profile } = useProfile();
  const {
    user,
    preferences,
    updateProfile,
    changePassword,
    setPreferences,
    deleteAccount,
    isAuthenticated,
    favorites,
    history,
    addFavorite,
    addToHistory,
  } = useUser();

  const { theme, toggleTheme } = useTheme();

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
    } catch {
      setLibraryData({ favorites: [], history: [], playlists: [] });
    }
  }, [favorites, history, profile.id]);

  const canDelete = confirmText === (user?.username ?? "");

  async function handleSaveName() {
    setSaveError(null);
    try {
      if (isAuthenticated) {
        await updateProfile({ username: displayName });
      }
    } catch (e) {
      setSaveError((e as Error).message);
    }
  }

  async function handleSaveEmail() {
    setSaveError(null);
    try {
      if (isAuthenticated) {
        await updateProfile({ email });
      }
    } catch (e) {
      setSaveError((e as Error).message);
    }
  }

  async function handleChangePassword() {
    setPasswordError(null);
    if (passwords.next !== passwords.confirm) {
      setPasswordError("Passwords do not match");
      return;
    }
    if (passwords.next.length < 8) {
      setPasswordError("New password must be at least 8 characters");
      return;
    }
    try {
      await changePassword(passwords.current, passwords.next);
      setPasswords({ current: "", next: "", confirm: "" });
    } catch (e) {
      setPasswordError((e as Error).message);
    }
  }

  async function handleDeleteAccount() {
    try {
      await deleteAccount();
    } catch (e) {
      if (process.env.NODE_ENV !== "production") {
        console.error(e);
      }
    }
  }

  function handleExportJSON() {
    try {
      const queueState = JSON.parse(window.localStorage.getItem("ponotai.queue.v1") ?? "{}") as { queue?: Array<{ track?: { title?: string; artist?: string; artworkUrl?: string; videoId?: string } }> };
      const payload = {
        version: LIBRARY_EXPORT_VERSION,
        exportedAt: new Date().toISOString(),
        app: "Trackly" as const,
        user: user ? { id: user.id, username: user.username, email: user.email } : null,
        data: {
          favorites: favorites ?? [],
          history: history ?? [],
          playlists: libraryData.playlists ?? [],
          queue: (queueState.queue ?? []).map((entry) => ({
            title: entry.track?.title ?? "",
            artist: entry.track?.artist ?? "",
            artworkUrl: entry.track?.artworkUrl,
            videoId: entry.track?.videoId,
          })).filter((entry) => entry.title && entry.artist),
          settings: {
            theme: window.localStorage.getItem("ponotai-theme"),
            language: window.localStorage.getItem("ponotai-language"),
          },
        },
      };
      exportLibraryAsJSON(payload, user?.username || "guest");
      alert("Library exported successfully as JSON!");
    } catch (e) {
      alert("Export failed: " + (e instanceof Error ? e.message : "Unknown error"));
    }
  }

  function handleExportCSV() {
    try {
      exportLibraryAsCSV(
        favorites,
        history,
        user?.username || "library"
      );
      alert("Library exported successfully as CSV!");
    } catch (e) {
      if (process.env.NODE_ENV !== "production") {
        console.error("Export failed:", e);
      }
      alert("Export failed: " + (e instanceof Error ? e.message : "Unknown error"));
    }
  }

  async function handleImport(file: File) {
    setIsImporting(true);
    setImportSummary(null);
    try {
      const payload = await importLibraryFromJSON(file);
      const favoritesToImport = dedupeByTrack(payload.data.favorites ?? []);
      const historyToImport = dedupeByTrack(payload.data.history ?? []);
      for (const item of historyToImport) {
        await addToHistory(item);
      }
      const playlistsToImport = Array.isArray(payload.data.playlists) ? payload.data.playlists : [];

      let importedFavorites = 0;
      const duplicateFavorites = Math.max(0, (payload.data.favorites ?? []).length - favoritesToImport.length);
      for (const fav of favoritesToImport) {
        await addFavorite({ title: fav.title, artist: fav.artist, album: fav.album, coverUrl: fav.coverUrl });
        importedFavorites += 1;
      }

      if (!isAuthenticated) {
        window.localStorage.setItem(scopedKey("ponotai.library.playlists", profile.id), JSON.stringify(playlistsToImport));
      }

      window.localStorage.setItem("ponotai.queue.v1", JSON.stringify({ queue: (payload.data.queue ?? []).map((entry) => ({ queueId: crypto.randomUUID(), addedAt: new Date().toISOString(), source: 'manual', track: { id: `${entry.title}-${entry.artist}`, title: entry.title, artist: entry.artist, artworkUrl: entry.artworkUrl, videoId: entry.videoId, query: `${entry.title} ${entry.artist}` } })) }));

      const theme = payload.data.settings?.theme;
      const language = payload.data.settings?.language;
      if (typeof theme === 'string') window.localStorage.setItem('ponotai-theme', theme);
      if (typeof language === 'string') window.localStorage.setItem('ponotai-language', language);

      setImportSummary(`Imported favorites: ${importedFavorites} (skipped duplicates: ${duplicateFavorites}), history entries: ${historyToImport.length}, playlists: ${playlistsToImport.length}.`);
      alert('Library imported successfully!');
    } catch (e) {
      alert(`Import failed: ${(e as Error).message}`);
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <h1 className="text-3xl font-bold text-text-primary tracking-tight">Settings</h1>

      <Card className="p-6 space-y-4">
        <h2 className="text-xl font-semibold text-text-primary">Account</h2>
        {saveError && <p className="text-sm text-danger">{saveError}</p>}
        
        {user && (
          <div className="mb-4 p-4 rounded-lg bg-surface-raised border border-border">
            <p className="text-xs text-text-muted mb-1">User ID</p>
            <p className="text-sm font-mono text-text-primary break-all">{user.id}</p>
            <p className="text-xs text-text-muted mt-3 mb-1">Email</p>
            <p className="text-sm text-text-primary">{user.email}</p>
            <p className="text-xs text-text-muted mt-3 mb-1">Member since</p>
            <p className="text-sm text-text-primary">{new Date(user.createdAt).toLocaleDateString()}</p>
            {user.bio && (
              <>
                <p className="text-xs text-text-muted mt-3 mb-1">Bio</p>
                <p className="text-sm text-text-primary">{user.bio}</p>
              </>
            )}
          </div>
        )}
        
        <div>
          <label className="text-sm font-medium text-text-primary mb-1 block">Display name</label>
          <div className="flex gap-2">
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            <Button variant="primary" onClick={handleSaveName}>Save</Button>
          </div>
        </div>
        <div>
          <label className="text-sm font-medium text-text-primary mb-1 block">Email</label>
          <div className="flex gap-2">
            <Input value={email} onChange={(e) => setEmail(e.target.value)} />
            <Button variant="primary" onClick={handleSaveEmail}>Save</Button>
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="text-xl font-semibold text-text-primary">Security</h2>
        {!isAuthenticated && (
          <p className="text-sm text-text-muted">Sign in to change your password.</p>
        )}
        {passwordError && <p className="text-sm text-danger">{passwordError}</p>}
        {(["current", "next", "confirm"] as const).map((key) => (
          <div key={key}>
            <label className="text-sm font-medium text-text-primary mb-1 block capitalize">{key} password</label>
            <div className="flex gap-2">
              <Input
                type={show[key] ? "text" : "password"}
                value={passwords[key]}
                disabled={!isAuthenticated}
                onChange={(e) => setPasswords((p) => ({ ...p, [key]: e.target.value }))}
              />
              <Button variant="secondary" onClick={() => setShow((prev) => ({ ...prev, [key]: !prev[key] }))}>
                {show[key] ? "Hide" : "Show"}
              </Button>
            </div>
          </div>
        ))}
        {isAuthenticated && (
          <Button variant="primary" onClick={handleChangePassword}>Update Password</Button>
        )}
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="text-xl font-semibold text-text-primary">Appearance</h2>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <p className="text-sm text-text-muted">Current theme: <span className="font-medium text-text-primary capitalize">{theme}</span></p>
          </div>
          <Button
            variant="secondary"
            onClick={toggleTheme}
          >
            {theme === "dark" ? (<span className="inline-flex items-center gap-2"><Sun className="w-4 h-4 text-[var(--muted)]" />Light Mode</span>) : (<span className="inline-flex items-center gap-2"><Moon className="w-4 h-4 text-[var(--muted)]" />Dark Mode</span>)}
          </Button>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="text-xl font-semibold text-text-primary">Notifications</h2>
        <Button
          variant="secondary"
          onClick={() => setPreferences({ notifications: !preferences.notifications })}
        >
          {preferences.notifications ? "Disable" : "Enable"} notifications
        </Button>
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="text-xl font-semibold text-text-primary">Data Management</h2>
        <p className="text-sm text-text-muted mb-4">Export or import your library data for backup or migration.</p>
        
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-text-primary mb-2 block">Export Library</label>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={handleExportJSON} className="flex-1">
                <span className="inline-flex items-center gap-2"><Download className="w-4 h-4 text-[var(--muted)]" />Export as JSON</span>
              </Button>
              <Button variant="secondary" onClick={handleExportCSV} className="flex-1">
                <span className="inline-flex items-center gap-2"><FileSpreadsheet className="w-4 h-4 text-[var(--muted)]" />Export as CSV</span>
              </Button>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-text-primary mb-2 block">Import Library</label>
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleImport(file);
                }}
                className="hidden"
              />
              <Button 
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
                className="flex-1"
              >
                <span className="inline-flex items-center gap-2"><Upload className="w-4 h-4 text-[var(--muted)]" />Import from JSON</span>
              </Button>
            </div>
            {importSummary ? <p className="text-xs text-[var(--muted)] mt-2">{importSummary}</p> : null}
            <p className="text-xs text-text-muted mt-2">
              Statistics: {libraryData.favorites.length} favorites · {libraryData.playlists.length} playlists · {libraryData.history.length} history entries
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-4" style={{ borderColor: "var(--color-danger, #ef4444)" }}>
        <h2 className="text-xl font-semibold text-text-primary">Danger Zone</h2>
        <Button variant="danger" onClick={() => setShowDangerModal(true)}><span className="inline-flex items-center gap-2"><Trash2 className="w-4 h-4 text-white" />Delete Account</span></Button>
      </Card>

      {showDangerModal && (
        <Modal isOpen={showDangerModal} onClose={() => setShowDangerModal(false)} title="Type your username to confirm" maxWidth="520px">
          <div className="space-y-4">
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={user?.username ?? "username"}
            />
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setShowDangerModal(false)}>Cancel</Button>
              <Button variant="danger" disabled={!canDelete} onClick={handleDeleteAccount}>
                Confirm delete
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
