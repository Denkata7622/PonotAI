"use client";

import type { Playlist } from "../features/library/types";
import type { Track } from "../features/tracks/types";
import { normalizeTrackKey } from "../lib/dedupe";
import SongRow from "./SongRow";

type TrackCardProps = {
  track: Track;
  playlists: Playlist[];
  isFavorite: boolean;
  onToggleFavorite: (trackId: string, title?: string, artist?: string) => void;
  onAddToPlaylist: (trackId: string, playlistId: string, videoId?: string) => void;
  onCreatePlaylist: (playlistName: string) => void;
  onDeletePlaylist: (playlistId: string) => void;
  onRemoveFromPlaylist?: (trackId: string, playlistId: string) => void;
  activePlaylistId?: string;
  onPlay?: (track: Track) => void;
};

export default function TrackCard({ track, playlists, isFavorite, onToggleFavorite, onAddToPlaylist, onPlay }: TrackCardProps) {
  const normalizedTrackKey = normalizeTrackKey(track.title, track.artistName);

  return (
    <SongRow
      id={track.id}
      title={track.title}
      artist={track.artistName}
      artworkUrl={track.artworkUrl}
      videoId={track.youtubeVideoId}
      isFavorite={isFavorite}
      onFavorite={() => onToggleFavorite(normalizedTrackKey, track.title, track.artistName)}
      onPlay={() => onPlay?.(track)}
      showMoreMenu
      playlists={playlists}
      onAddToPlaylist={(playlistId) => onAddToPlaylist(track.id, playlistId, track.youtubeVideoId)}
    />
  );
}
