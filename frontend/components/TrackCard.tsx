"use client";

import type { Playlist } from "../features/library/types";
import type { Track } from "../features/tracks/types";
import SongRow from "./SongRow";

type TrackCardProps = {
  track: Track;
  playlists: Playlist[];
  isFavorite: boolean;
  onToggleFavorite: (trackId: string, title?: string, artist?: string, artworkUrl?: string, videoId?: string) => void;
  onAddToPlaylist: (trackId: string, playlistId: string, videoId?: string) => void;
  onCreatePlaylist: (playlistName: string) => void;
  onDeletePlaylist: (playlistId: string) => void;
  onRemoveFromPlaylist?: (trackId: string, playlistId: string) => void;
  activePlaylistId?: string;
  onPlay?: (track: Track) => void;
};

export default function TrackCard({ track, playlists, isFavorite, onToggleFavorite, onAddToPlaylist, onPlay }: TrackCardProps) {
  return (
    <SongRow
      id={track.id}
      title={track.title}
      artist={track.artistName}
      artworkUrl={track.artworkUrl}
      videoId={track.youtubeVideoId}
      isFavorite={isFavorite}
      onFavorite={() => onToggleFavorite(track.id, track.title, track.artistName, track.artworkUrl, track.youtubeVideoId)}
      onPlay={() => onPlay?.(track)}
      showMoreMenu
      playlists={playlists}
      onAddToPlaylist={(playlistId) => onAddToPlaylist(track.id, playlistId, track.youtubeVideoId)}
    />
  );
}
