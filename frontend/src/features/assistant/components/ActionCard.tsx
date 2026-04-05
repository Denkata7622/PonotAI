'use client';

import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle, Heart, Languages, ListMusic, ListPlus, Search, Sun, X } from "lucide-react";
import { usePlayer } from "@/components/PlayerProvider";
import { createPlaylist } from "@/features/library/api";
import { useUser } from "@/src/context/UserContext";
import { useTheme } from "@/lib/ThemeContext";
import { useLanguage } from "@/lib/LanguageContext";
import { useProfile } from "@/lib/ProfileContext";
import { useLibrary } from "@/features/library/useLibrary";
import type { ActionIntent } from "../types";

type Props = {
  intent: ActionIntent;
  onAccept: () => void;
  onDismiss: () => void;
  state: "pending" | "accepted" | "dismissed" | "failed";
};

function getActionLabel(type: ActionIntent["type"]) {
  if (type === "ADD_TO_QUEUE") return { icon: ListPlus, text: "Add to Queue" };
  if (type === "CREATE_PLAYLIST") return { icon: ListMusic, text: "Create Playlist" };
  if (type === "FAVORITE_TRACK") return { icon: Heart, text: "Favorite" };
  if (type === "CHANGE_THEME") return { icon: Sun, text: "Change Theme" };
  if (type === "CHANGE_LANGUAGE") return { icon: Languages, text: "Change Language" };
  return { icon: Search, text: "Search" };
}

function parseTrackId(trackId: string): { title: string; artist: string } {
  const [title, artist] = trackId.split("|||");
  return { title: title || "Unknown Song", artist: artist || "Unknown Artist" };
}

export default function ActionCard({ intent, onAccept, onDismiss, state }: Props) {
  const router = useRouter();
  const { addManyToQueue } = usePlayer();
  const { addFavorite, favorites } = useUser();
  const { setTheme } = useTheme();
  const { setLocale } = useLanguage();
  const { profile } = useProfile();
  const { playlists } = useLibrary(profile.id);
  const { icon: Icon, text } = getActionLabel(intent.type);

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
          window.dispatchEvent(new CustomEvent("ponotai-toast", { detail: { text: `Created ${name} with ${trackIds.length} songs.` } }));
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

      if (intent.type === "CHANGE_THEME") {
        const theme = intent.payload.theme as "light" | "dark" | "system";
        setTheme(theme);
        window.dispatchEvent(new CustomEvent("ponotai-toast", { detail: { text: `Switched to ${theme} mode` } }));
      }

      if (intent.type === "CHANGE_LANGUAGE") {
        const locale = intent.payload.locale as "en" | "bg";
        setLocale(locale);
        window.dispatchEvent(new CustomEvent("ponotai-toast", { detail: { text: `Language changed to ${locale}` } }));
      }

      window.dispatchEvent(new CustomEvent("ponotai-toast", { detail: { text: "Assistant action completed." } }));
      onAccept();
    } catch {
      window.dispatchEvent(new CustomEvent("ponotai-toast", { detail: { text: "Assistant action failed." } }));
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
          <button type="button" onClick={handleAccept} className="assistant-action-primary">Accept</button>
          <button type="button" onClick={onDismiss} className="assistant-action-ghost">Dismiss</button>
        </div>
      )}
      {state === "accepted" && <p className="assistant-action-success"><CheckCircle width={14} height={14} strokeWidth={1.8} /> Done</p>}
      {state === "dismissed" && <p className="assistant-action-muted"><X width={14} height={14} strokeWidth={1.8} /> Dismissed</p>}
      {state === "failed" && <p className="assistant-action-failed"><AlertCircle width={14} height={14} strokeWidth={1.8} /> Failed — try again</p>}
    </div>
  );
}
