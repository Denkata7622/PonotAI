"use client";

import { useMemo, useRef, useState } from "react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Textarea } from "../components/ui/Textarea";
import { useUser } from "../context/UserContext";
import type { HistoryItem } from "../context/UserContext";

function formatDate(dateIso: string) {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(dateIso));
  } catch {
    return dateIso;
  }
}

type HistoryFilter = "all" | "recognized" | "unrecognized" | "audio-record" | "audio-file" | "album-image";

export default function ProfilePage() {
  const {
    user,
    history,
    favorites,
    manualSubmissions,
    isLoading,
    updateProfile,
    deleteHistoryItem,
    clearHistory,
    removeFavorite,
  } = useUser();

  const [editMode, setEditMode] = useState(false);
  const [draftName, setDraftName] = useState(user?.username ?? "");
  const [draftBio, setDraftBio] = useState(user?.bio ?? "");
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [confirmClear, setConfirmClear] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const filteredHistory = useMemo(() => {
    if (historyFilter === "all") return history;
    if (historyFilter === "recognized") return history.filter((item) => item.recognized);
    if (historyFilter === "unrecognized") return history.filter((item) => !item.recognized);
    return history.filter((item) => item.method === historyFilter);
  }, [historyFilter, history]);

  const stats = useMemo(() => {
    const total = history.length;
    const recognized = history.filter((item) => item.recognized).length;
    const successRate = total ? Math.round((recognized / total) * 100) : 0;

    const artistCount = new Map<string, number>();
    history.forEach((item) => {
      const artist = (item as HistoryItem & { artist?: string }).artist;
      if (!artist) return;
      artistCount.set(artist, (artistCount.get(artist) ?? 0) + 1);
    });

    const mostArtist = [...artistCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

    const dayCount = new Map<string, number>();
    history.forEach((item) => {
      const dateStr = (item as HistoryItem & { createdAt?: string }).createdAt;
      if (!dateStr) return;
      const day = new Date(dateStr).toLocaleDateString("en-US", { weekday: "short" });
      dayCount.set(day, (dayCount.get(day) ?? 0) + 1);
    });
    const mostActiveDay = [...dayCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

    return { total, successRate, mostArtist, mostActiveDay };
  }, [history]);

  function onPickAvatar(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      updateProfile({ avatarBase64: String(reader.result ?? "") }).catch(console.error);
    };
    reader.readAsDataURL(file);
  }

  async function handleSaveProfile() {
    setSaveError(null);
    try {
      await updateProfile({
        username: draftName.trim() || user?.username,
        bio: draftBio.trim(),
      });
      setEditMode(false);
    } catch (e) {
      setSaveError((e as Error).message);
    }
  }

  const initials = (user?.username ?? "G")
    .split(" ")
    .map((chunk) => chunk[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const avatarSrc = user?.avatarBase64 ?? null;

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="h-32 rounded-xl bg-surface-raised animate-pulse" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Card className="p-6 text-sm text-text-muted">Please sign in to view your profile.</Card>
      </div>
    );
  }
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <h1 className="text-3xl font-bold text-text-primary tracking-tight">Profile</h1>

      {/* Header */}
      <Card className="p-6">
        <div className="flex flex-wrap items-center gap-4">
          <button
            className="h-24 w-24 rounded-full bg-surface-overlay border border-border flex items-center justify-center text-2xl font-bold cursor-pointer select-none transition-all duration-200 overflow-hidden"
            onClick={() => fileRef.current?.click()}
          >
            {avatarSrc
              ? <img src={avatarSrc} alt="avatar" className="h-full w-full rounded-full object-cover" />
              : initials}
          </button>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept="image/*"
            onChange={(e) => e.target.files?.[0] && onPickAvatar(e.target.files[0])}
          />
          <div className="flex-1 min-w-40">
            <h2 className="text-xl font-semibold text-text-primary">{user?.username ?? "Guest"}</h2>
            <p className="text-xs text-text-muted">
              {user?.email ?? "Not signed in"} • Joined {user?.createdAt ? formatDate(user.createdAt) : "—"}
            </p>
          </div>
          <Button variant="secondary" onClick={() => setEditMode((v) => !v)}>
            {editMode ? "Close" : "Edit Profile"}
          </Button>
        </div>
      </Card>

      {/* Bio */}
      <Card className="p-6 space-y-3">
        <h2 className="text-xl font-semibold text-text-primary">Bio</h2>
        {saveError && <p className="text-sm text-danger">{saveError}</p>}
        {editMode ? (
          <>
            <Input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="Display name"
            />
            <Textarea
              maxLength={200}
              rows={4}
              value={draftBio}
              onChange={(e) => setDraftBio(e.target.value)}
            />
            <p className="text-xs text-text-muted">{draftBio.length}/200</p>
            <div className="flex gap-2">
              <Button variant="primary" onClick={handleSaveProfile}>Save</Button>
              <Button variant="ghost" onClick={() => {
                setDraftName(user?.username ?? "");
                setDraftBio(user?.bio ?? "");
                setEditMode(false);
              }}>Cancel</Button>
            </div>
          </>
        ) : (
          <p className="text-sm text-text-primary leading-relaxed">
            {user?.bio || <span className="text-text-muted italic">No bio yet.</span>}
          </p>
        )}
      </Card>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card><p className="text-3xl font-bold text-text-primary">{stats.total}</p><p className="text-xs text-text-muted">Total Recognitions</p></Card>
        <Card><p className="text-3xl font-bold text-text-primary">{stats.successRate}%</p><p className="text-xs text-text-muted">Success Rate</p></Card>
        <Card><p className="text-3xl font-bold text-text-primary truncate">{stats.mostArtist}</p><p className="text-xs text-text-muted">Most Recognized Artist</p></Card>
        <Card><p className="text-3xl font-bold text-text-primary">{stats.mostActiveDay}</p><p className="text-xs text-text-muted">Most Active Day</p></Card>
      </div>

      {/* History */}
      <Card className="p-6 space-y-4" onMouseLeave={() => setConfirmClear(false)}>
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold text-text-primary">
            Search History ({history.length})
          </h2>
          {!confirmClear
            ? <Button variant="ghost" onClick={() => setConfirmClear(true)}>Clear all</Button>
            : <Button variant="danger" onClick={() => { void clearHistory(); setConfirmClear(false); }}>Are you sure?</Button>}
        </div>
        <div className="flex flex-wrap gap-2">
          {(["all", "recognized", "unrecognized", "audio-record", "audio-file", "album-image"] as const).map((filter) => (
            <Button
              key={filter}
              variant={historyFilter === filter ? "primary" : "secondary"}
              size="sm"
              onClick={() => setHistoryFilter(filter)}
            >
              {filter}
            </Button>
          ))}
        </div>
        <div className="max-h-[400px] overflow-y-auto space-y-2">
          {filteredHistory.length === 0 && (
            <p className="text-sm text-text-muted text-center py-6">No history yet.</p>
          )}
          {filteredHistory.map((item) => (
            <div key={item.id} className="bg-surface-raised border border-border rounded-xl p-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-text-muted">
                  {item.createdAt ? formatDate(item.createdAt) : "—"} • {item.method ?? "unknown"}
                </p>
                {item.recognized && item.title
                  ? <p className="text-sm text-text-primary">{item.title}{item.artist ? ` — ${item.artist}` : ""}</p>
                  : <p className="text-sm text-danger">Not recognized</p>}
              </div>
              <button
                aria-label="Delete history item"
                className="text-text-muted hover:text-danger transition-all duration-200 cursor-pointer select-none"
                onClick={() => void deleteHistoryItem(item.id)}
              >
                🗑
              </button>
            </div>
          ))}
        </div>
      </Card>

      {/* Favorites */}
      <Card className="p-6 space-y-4">
        <h2 className="text-xl font-semibold text-text-primary">Favorites</h2>
        {favorites.length === 0
          ? <p className="text-sm text-text-muted text-center py-8">💿 No saved songs yet</p>
          : (
            <div className="grid gap-4 grid-cols-2 md:grid-cols-3">
              {favorites.map((song) => (
                <article key={song.id} className="bg-surface-raised border border-border rounded-xl p-4 space-y-2">
                  <img
                    src={song.coverUrl ?? "https://picsum.photos/seed/empty/240"}
                    alt={song.title}
                    className="h-32 w-full rounded-lg object-cover"
                  />
                  <p className="text-sm font-semibold text-text-primary truncate">{song.title}</p>
                  <p className="text-xs text-text-muted">{song.artist}{song.album ? ` • ${song.album}` : ""}</p>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-text-muted">{song.savedAt ? formatDate(song.savedAt) : "—"}</p>
                    <button
                      aria-label="Remove favorite"
                      className="cursor-pointer select-none transition-all duration-200 hover:scale-110"
                      onClick={() => void removeFavorite(song.id)}
                    >
                      ❤️
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
      </Card>

      {/* Manual Submissions */}
      <Card className="p-6 space-y-4">
        <h2 className="text-xl font-semibold text-text-primary">Manual Submissions</h2>
        {manualSubmissions.length === 0
          ? <p className="text-sm text-text-muted">No submissions yet.</p>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-text-muted">
                  <tr>
                    <th className="pb-2">Title</th>
                    <th className="pb-2">Artist</th>
                    <th className="pb-2">Album</th>
                    <th className="pb-2">Date</th>
                    <th className="pb-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {manualSubmissions.map((item) => (
                    <tr key={item.id} className="border-t border-border">
                      <td className="py-2 text-text-primary">{item.title}</td>
                      <td className="py-2 text-text-primary">{item.artist}</td>
                      <td className="py-2 text-text-primary">{item.album ?? "—"}</td>
                      <td className="py-2 text-text-muted">{formatDate(item.submittedAt)}</td>
                      <td className="py-2">
                        {"status" in item && (item as { status: string }).status === "approved"
                          ? <Badge variant="success">approved</Badge>
                          : "status" in item && (item as { status: string }).status === "rejected"
                          ? <Badge variant="danger">rejected</Badge>
                          : <Badge variant="warning">pending</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Card>
    </div>
  );
}
