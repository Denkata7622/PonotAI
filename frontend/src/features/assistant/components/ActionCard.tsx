"use client";

import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle, Heart, ListMusic, ListPlus, Search, X } from "lucide-react";
import { usePlayer } from "@/components/PlayerProvider";
import { createPlaylist } from "@/features/library/api";
import { useUser } from "@/src/context/UserContext";
import type { ActionIntent } from "../types";

type Props = {
  intent: ActionIntent;
  onAccept: () => void;
  onDismiss: () => void;
  state: 'pending' | 'accepted' | 'dismissed' | 'failed';
};

function getActionLabel(type: ActionIntent["type"]) {
  if (type === "ADD_TO_QUEUE") return { icon: ListPlus, text: "Add to Queue" };
  if (type === "CREATE_PLAYLIST") return { icon: ListMusic, text: "Create Playlist" };
  if (type === "FAVORITE_TRACK") return { icon: Heart, text: "Favorite" };
  return { icon: Search, text: "Search" };
}

function parseTrackId(trackId: string): { title: string; artist: string } {
  const [title, artist] = trackId.split("|||");
  return { title: title || "Unknown Song", artist: artist || "Unknown Artist" };
}

export default function ActionCard({ intent, onAccept, onDismiss, state }: Props) {
  const router = useRouter();
  const { addToQueue } = usePlayer();
  const { addFavorite } = useUser();
  const { icon: Icon, text } = getActionLabel(intent.type);

  async function handleAccept() {
    try {
      if (intent.type === "ADD_TO_QUEUE") {
        const trackIds = (intent.payload.trackIds as string[]) ?? [];
        for (const trackId of trackIds) {
          const track = parseTrackId(trackId);
          addToQueue({
            title: track.title,
            artist: track.artist,
            artistId: `artist-${track.artist}`,
            artworkUrl: "https://picsum.photos/seed/assistant/80",
            license: "COPYRIGHTED",
            query: `${track.title} ${track.artist}`,
          });
        }
      }

      if (intent.type === "CREATE_PLAYLIST") {
        const name = String(intent.payload.name ?? "Assistant Playlist");
        await createPlaylist(name);
      }

      if (intent.type === "FAVORITE_TRACK") {
        const trackId = String(intent.payload.trackId ?? "");
        const track = parseTrackId(trackId);
        await addFavorite({ title: track.title, artist: track.artist });
      }

      if (intent.type === "SEARCH_AND_SUGGEST") {
        const query = String(intent.payload.query ?? "");
        router.push(`/search?q=${encodeURIComponent(query)}`);
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
