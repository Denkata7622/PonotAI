"use client";

import { useState, useRef } from "react";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { useUser } from "../context/UserContext";
import { useTheme } from "../../lib/ThemeContext";
import { exportLibraryAsJSON, exportLibraryAsCSV, importLibraryFromJSON } from "../lib/libraryExport";
import type { Playlist } from "../../features/library/types";

function getLibraryData() {
  if (typeof window === "undefined") {
    return { favorites: [], history: [], playlists: [] };
  }
  try {
    const favorites = JSON.parse(window.localStorage.getItem("ponotai.library.favorites") ?? "[]");
    const playlists = JSON.parse(window.localStorage.getItem("ponotai.library.playlists") ?? "[]");
    const history = JSON.parse(window.localStorage.getItem("ponotai-history") ?? "[]");
    return { favorites, history, playlists };
  } catch {
    return { favorites: [], history: [], playlists: [] };
  }
}

export default function SettingsPage() {
  const libraryData = getLibraryData();
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
  const [importFile, setImportFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      exportLibraryAsJSON(
        favorites,
        history,
        libraryData.playlists,
        user?.username || "library"
      );
      alert("Library exported successfully as JSON!");
    } catch (e) {
      if (process.env.NODE_ENV !== "production") {
        console.error("Export failed:", e);
      }
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
    try {
      const data = await importLibraryFromJSON(file);
      // Merge imported data with existing data
      for (const fav of data.data.favorites) {
        await addFavorite({
          title: fav.title,
          artist: fav.artist,
          album: fav.album,
          coverUrl: fav.coverUrl,
        });
      }
      alert("Library imported successfully!");
    } catch (e) {
      alert(`Import failed: ${(e as Error).message}`);
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
            {theme === "dark" ? "☀️ Light Mode" : "🌙 Dark Mode"}
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
                📥 Export as JSON
              </Button>
              <Button variant="secondary" onClick={handleExportCSV} className="flex-1">
                📄 Export as CSV
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
                  if (file) handleImport(file);
                }}
                className="hidden"
              />
              <Button 
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
                className="flex-1"
              >
                📤 Import from JSON
              </Button>
            </div>
            <p className="text-xs text-text-muted mt-2">
              Statistics: {libraryData.favorites.length} favorites · {libraryData.playlists.length} playlists · {libraryData.history.length} history entries
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-4" style={{ borderColor: "var(--color-danger, #ef4444)" }}>
        <h2 className="text-xl font-semibold text-text-primary">Danger Zone</h2>
        <Button variant="danger" onClick={() => setShowDangerModal(true)}>Delete Account</Button>
      </Card>

      {showDangerModal && (
        <div className="fixed inset-0 bg-page backdrop-blur-sm z-40 flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl shadow-xl border border-border p-6 z-50 max-w-md w-full space-y-4">
            <h3 className="text-base font-semibold text-text-primary">
              Type your username to confirm
            </h3>
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
        </div>
      )}
    </div>
  );
}
