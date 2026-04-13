'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle, Heart, Languages, ListMusic, ListPlus, Search, Sun, X } from "lucide-react";
import { usePlayer } from "@/components/PlayerProvider";
import { useUser } from "@/src/context/UserContext";
import { useTheme } from "@/lib/ThemeContext";
import { useLanguage } from "@/lib/LanguageContext";
import { t } from "@/lib/translations";
import { useProfile } from "@/lib/ProfileContext";
import { useLibrary } from "@/features/library/useLibrary";
import { runAssistantAction } from "../api";
import { hasApplicableThemeChange, normalizeThemeActionPayload } from "../themeAction";
import type { ActionIntent } from "../types";

type Props = {
  intent: ActionIntent;
  onApplyStart: () => void;
  onApplySuccess: () => void;
  onDismiss: () => void;
  onApplyFailure: () => void;
  state: "pending" | "applying" | "accepted" | "dismissed" | "failed";
};

function getActionLabel(type: ActionIntent["type"]) {
  if (type === "ADD_TO_QUEUE") return { icon: ListPlus, text: "Add to Queue" };
  if (type === "CREATE_PLAYLIST") return { icon: ListMusic, text: "Create Playlist" };
  if (type === "FAVORITE_TRACK") return { icon: Heart, text: "Favorite" };
  if (type === "CHANGE_THEME") return { icon: Sun, text: "Change Theme" };
  if (type === "CHANGE_LANGUAGE") return { icon: Languages, text: "Change Language" };
  if (type === "INSIGHT_REQUEST") return { icon: Search, text: "Show Insights" };
  if (type === "PLAYLIST_GENERATION") return { icon: ListMusic, text: "Generate Playlist" };
  if (type === "MOOD_RECOMMENDATION") return { icon: Search, text: "Mood Picks" };
  if (type === "CONTEXT_RECOMMENDATION") return { icon: Search, text: "Context Picks" };
  if (type === "TAG_SUGGESTION") return { icon: Search, text: "Tag Library" };
  if (type === "DISCOVERY_REQUEST") return { icon: Search, text: "Discovery" };
  if (type === "CROSS_ARTIST_DISCOVERY") return { icon: Search, text: "Find New Artists" };
  if (type === "SHOW_SIMILAR_ARTISTS") return { icon: Search, text: "Show Similar Artists" };
  if (type === "SEARCH_ARTIST") return { icon: Search, text: "Search Artist" };
  if (type === "PREVIEW_DISCOVERY_PLAYLIST") return { icon: ListMusic, text: "Preview Discovery Playlist" };
  if (type === "CREATE_DISCOVERY_PLAYLIST") return { icon: ListPlus, text: "Create Discovery Playlist" };
  return { icon: Search, text: "Search" };
}

function parseTrackId(trackId: string): { title: string; artist: string } {
  const [title, artist] = trackId.split("|||");
  return { title: title || "Unknown Song", artist: artist || "Unknown Artist" };
}

export default function ActionCard({ intent, onApplyStart, onApplySuccess, onDismiss, onApplyFailure, state }: Props) {
  const router = useRouter();
  const { addManyToQueue } = usePlayer();
  const { addFavorite, favorites } = useUser();
  const { applyPersonalization } = useTheme();
  const { setLocale, language } = useLanguage();
  const { profile } = useProfile();
  const { playlists, createPlaylist, addSongsToPlaylist } = useLibrary(profile.id);
  const { icon: Icon, text } = getActionLabel(intent.type);
  const [busy, setBusy] = useState(false);

  function resolveTrack(trackId: string) {
    const parsed = parseTrackId(trackId);
    for (const playlist of playlists) {
      const found = playlist.songs.find((song) => `${song.title.toLowerCase().trim()}|||${song.artist.toLowerCase().trim()}` === trackId);
      if (found) {
        return {
          id: `${found.title}-${found.artist}`.toLowerCase().replace(/\s+/g, "-"),
          title: found.title,
          artist: found.artist,
          artistId: `artist-${found.artist}`,
          artworkUrl: found.coverUrl || "https://picsum.photos/seed/assistant/80",
          videoId: found.videoId,
          license: "COPYRIGHTED" as const,
          query: `${found.title} ${found.artist}`,
        };
      }
    }

    return {
      id: `${parsed.title}-${parsed.artist}`.toLowerCase().replace(/\s+/g, "-"),
      title: parsed.title,
      artist: parsed.artist,
      artistId: `artist-${parsed.artist}`,
      artworkUrl: "https://picsum.photos/seed/assistant/80",
      license: "COPYRIGHTED" as const,
      query: `${parsed.title} ${parsed.artist}`,
    };
  }

  async function handleAccept() {
    if (busy || state === "applying") return;
    setBusy(true);
    onApplyStart();
    try {
      if (intent.type === "ADD_TO_QUEUE") {
        const trackIds = (intent.payload.trackIds as string[]) ?? [];
        addManyToQueue(trackIds.map(resolveTrack), "assistant");
      }

      if (intent.type === "CREATE_PLAYLIST") {
        const trackIds = (intent.payload.trackIds as string[]) ?? [];
        const baseName = String(intent.payload.name ?? "Assistant Playlist");
        const existingNames = new Set(playlists.map((playlist) => playlist.name.toLowerCase()));
        let name = baseName;
        let suffix = 2;
        while (existingNames.has(name.toLowerCase())) {
          name = `${baseName} (${suffix})`;
          suffix += 1;
        }
        const playlist = await createPlaylist(name);
        if (playlist && trackIds.length) {
          const songs = trackIds.map(resolveTrack).map((track) => ({
            title: track.title,
            artist: track.artist,
            coverUrl: track.artworkUrl,
            videoId: track.videoId,
          }));
          const added = await addSongsToPlaylist(playlist.id, songs);
          window.dispatchEvent(new CustomEvent("ponotai-toast", { detail: { text: `Created ${name} with ${added} songs.` } }));
        }
      }

      if (intent.type === "FAVORITE_TRACK") {
        const trackId = String(intent.payload.trackId ?? "");
        const track = parseTrackId(trackId);
        const exists = favorites.some((item) => item.title === track.title && item.artist === track.artist);
        if (!exists) {
          await addFavorite({ title: track.title, artist: track.artist });
        }
      }

      if (intent.type === "SEARCH_AND_SUGGEST") {
        const query = String(intent.payload.query ?? "");
        router.push(`/search?q=${encodeURIComponent(query)}`);
      }
      if (intent.type === "SEARCH_ARTIST") {
        const artist = String(intent.payload.artist ?? "");
        router.push(`/search?q=${encodeURIComponent(artist)}`);
      }

      if (intent.type === "CHANGE_THEME") {
        const next = normalizeThemeActionPayload(intent.payload);
        if (!hasApplicableThemeChange(next)) throw new Error("No supported theme changes found in assistant action.");
        const { template: _template, ...patch } = next;
        applyPersonalization(patch);
        const summary = Object.values(patch).filter(Boolean).join(" / ");
        window.dispatchEvent(new CustomEvent("ponotai-toast", { detail: { text: summary ? `Applied ${summary}` : "Theme settings updated" } }));
      }

      if (intent.type === "CHANGE_LANGUAGE") {
        const locale = intent.payload.locale as "en" | "bg";
        setLocale(locale);
        window.dispatchEvent(new CustomEvent("ponotai-toast", { detail: { text: `Language changed to ${locale}` } }));
      }

      if (
        intent.type === "INSIGHT_REQUEST"
        || intent.type === "PLAYLIST_GENERATION"
        || intent.type === "MOOD_RECOMMENDATION"
        || intent.type === "CONTEXT_RECOMMENDATION"
        || intent.type === "TAG_SUGGESTION"
        || intent.type === "DISCOVERY_REQUEST"
        || intent.type === "CROSS_ARTIST_DISCOVERY"
        || intent.type === "SHOW_SIMILAR_ARTISTS"
        || intent.type === "PREVIEW_DISCOVERY_PLAYLIST"
        || intent.type === "CREATE_DISCOVERY_PLAYLIST"
      ) {
        const result = await runAssistantAction(intent);
        window.dispatchEvent(new CustomEvent("ponotai-toast", { detail: { text: `AI action complete: ${text}` } }));
        console.info("[assistant action]", result);
      }

      onApplySuccess();
    } catch {
      window.dispatchEvent(new CustomEvent("ponotai-toast", { detail: { text: "Assistant action failed." } }));
      onApplyFailure();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="assistant-action-card">
      <div className="assistant-action-badge"><Icon width={14} height={14} strokeWidth={1.8} /> {text}</div>
      {intent.reason ? <p className="assistant-action-reason">{intent.reason}</p> : null}
      {(intent.type === "ADD_TO_QUEUE" || intent.type === "CREATE_PLAYLIST") && (
        <p className="assistant-action-meta">Tracks: {Array.isArray(intent.payload.trackIds) ? intent.payload.trackIds.length : 0}</p>
      )}

      {state === "pending" && (
        <div className="assistant-action-buttons">
          <button type="button" onClick={handleAccept} className="assistant-action-primary" disabled={busy}>{t("assistant_accept", language)}</button>
          <button type="button" onClick={onDismiss} className="assistant-action-ghost" disabled={busy}>{t("assistant_dismiss", language)}</button>
        </div>
      )}
      {state === "applying" && <p className="assistant-action-muted">Applying…</p>}
      {state === "accepted" && <p className="assistant-action-success"><CheckCircle width={14} height={14} strokeWidth={1.8} /> {t("assistant_done", language)}</p>}
      {state === "dismissed" && <p className="assistant-action-muted"><X width={14} height={14} strokeWidth={1.8} /> {t("assistant_dismissed", language)}</p>}
      {state === "failed" && <p className="assistant-action-failed"><AlertCircle width={14} height={14} strokeWidth={1.8} /> {t("assistant_failed_try", language)}</p>}
    </div>
  );
}
