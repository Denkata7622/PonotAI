"use client";

import { useEffect, useState } from "react";
import { Check, Heart, MicOff, Play, Save, ScrollText, Share2 } from "../lucide-react";
import type { SongMatch } from "../features/recognition/api";
import { t, type Language } from "../lib/translations";
import { toSongKey } from "../lib/songIdentity";
import { Card } from "../src/components/ui/Card";
import { Button } from "../src/components/ui/Button";
import { Badge } from "../src/components/ui/Badge";
import { useUser } from "../src/context/UserContext";

type ResultCardProps = {
  language: Language;
  song: SongMatch | null;
  onSave: (song: SongMatch) => void;
  onPlay: (song: SongMatch) => void;
  onFavorite?: (song: SongMatch) => void;
  favoritedKeys?: Set<string>;
};

export default function ResultCard({ language, song, onSave, onPlay, onFavorite, favoritedKeys }: ResultCardProps) {
  const { isAuthenticated, shareSong } = useUser();
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareHint, setShareHint] = useState<string | null>(null);
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const [lyrics, setLyrics] = useState<string | null>(null);
  const [favoriteConfirmed, setFavoriteConfirmed] = useState(false);

  useEffect(() => {
    setLyricsOpen(false);
    setLyrics(null);
    setFavoriteConfirmed(false);
  }, [song?.songName, song?.artist]);

  if (!song) {
    return (
      <Card className="rounded-3xl p-8 text-center">
        <p className="text-2xl font-semibold">{t("empty_results_title", language)}</p>
        <p className="mt-3 text-text-muted">{t("empty_results_hint", language)}</p>
      </Card>
    );
  }

  const currentSong = song;

  const favoriteKey = toSongKey({ title: song.songName, artist: song.artist });

  function confidenceLabel() {
    if ((currentSong.resultState ?? "") === "exact_match") return "Exact match";
    if ((currentSong.resultState ?? "") === "strong_likely_match") return "Likely match";
    if ((currentSong.resultState ?? "") === "possible_matches") return "Possible match";
    return "Need clearer sample";
  }

  const isFavorited = favoritedKeys?.has(favoriteKey) ?? false;

  if (process.env.NODE_ENV === "development") {
    console.log("[ResultCard] favorite key check", { favoriteKey, isFavorited });
  }

  async function handleShare() {
    if (!currentSong) return;
    if (!isAuthenticated) {
      setShareHint("Sign in to share");
      return;
    }

    const url = await shareSong({
      title: currentSong.songName,
      artist: currentSong.artist,
      album: currentSong.album,
      coverUrl: currentSong.albumArtUrl,
    });

    if (url) {
      setShareUrl(url);
      setShareHint(null);
    }
  }

  async function toggleLyrics() {
    if (lyricsOpen) {
      setLyricsOpen(false);
      return;
    }

    setLyricsOpen(true);
    if (lyrics !== null) return;

    try {
      const response = await fetch(`/api/lyrics?artist=${encodeURIComponent(currentSong.artist)}&title=${encodeURIComponent(currentSong.songName)}`);
      if (!response.ok) {
        setLyrics("");
        return;
      }
      const payload = (await response.json()) as { lyrics: string | null };
      setLyrics(payload.lyrics ?? "");
    } catch {
      setLyrics("");
    }
  }

  return (
    <Card className="resultCardAnimated rounded-3xl p-6">
      <div className="grid gap-6 md:grid-cols-[220px_1fr]">
        <img src={song.albumArtUrl} alt={t("album_cover", language)} className="h-[220px] w-[220px] rounded-2xl object-cover shadow-xl" />

        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-text-muted">{t("recognition_result", language)}</p>
          <h2 className="mt-3 text-3xl font-bold leading-tight">{song.songName}</h2>
          <p className="mt-2 text-xl text-text-muted">{song.artist}</p>
          <p className="mt-3 text-sm text-text-muted">{song.album} • {song.genre} • {song.releaseYear ?? "—"}</p>

          {(song.confidence >= 0.45 || song.resultState) && (
            <div className="mt-5 flex items-center gap-2">
              <Badge variant={song.confidence >= 0.72 ? "success" : "warning"}>{confidenceLabel()}</Badge>
              <div className="h-2 w-full rounded-full bg-surface-raised">
                <div className="h-2 rounded-full bg-gradient-to-r from-[var(--chart-1)] to-[var(--chart-2)]" style={{ width: `${Math.round(song.confidence * 100)}%` }} />
              </div>
            </div>
          )}


          {song.alternatives && song.alternatives.length > 0 && (
            <div className="mt-3 rounded-xl border border-border bg-[var(--surface-raised)] p-3 text-xs text-text-muted">
              <p className="font-semibold text-text-primary">Possible matches</p>
              {song.alternatives.slice(0, 3).map((alt) => (
                <p key={`${alt.songName}-${alt.artist}`}>{alt.songName} — {alt.artist}</p>
              ))}
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <button className="pillAction inline-flex items-center gap-2" onClick={() => onPlay(song)}><Play className="w-4 h-4 text-[var(--text)]" /> {t("btn_play", language)}</button>
            <button className="pillAction inline-flex items-center gap-2" onClick={() => onSave(song)}><Save className="w-4 h-4 text-[var(--text)]" /> {t("btn_save", language)}</button>
            <button className="glassBtn inline-flex items-center gap-2" onClick={() => void handleShare()}><Share2 className="w-4 h-4 text-[var(--text)]" /> Share</button>
            {song.platformLinks.spotify && <a className="pillAction border-[var(--accent-border)] bg-[var(--surface-tinted)]" href={song.platformLinks.spotify} target="_blank" rel="noreferrer">{t("btn_spotify", language)}</a>}
            {song.platformLinks.appleMusic && <a className="pillAction border-[var(--accent-border)] bg-[var(--surface-tinted)]" href={song.platformLinks.appleMusic} target="_blank" rel="noreferrer">{t("btn_apple_music", language)}</a>}
            {song.platformLinks.youtubeMusic && <a className="pillAction border-[var(--accent-border)] bg-[var(--surface-tinted)]" href={song.platformLinks.youtubeMusic} target="_blank" rel="noreferrer">{t("btn_youtube_music", language)}</a>}
            {onFavorite && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  onFavorite(song);
                  setFavoriteConfirmed(true);
                  window.setTimeout(() => setFavoriteConfirmed(false), 500);
                }}
                disabled={favoriteConfirmed}
              >
                {favoriteConfirmed ? (
                  <Check className="w-4 h-4 text-[var(--text)]" />
                ) : (
                  <Heart className={`w-4 h-4 ${isFavorited ? "fill-current status-danger" : "text-[var(--text)]"}`} />
                )}
              </Button>
            )}
          </div>

          <button className="mt-4 inline-flex items-center gap-2 rounded-xl border border-border bg-[var(--surface-raised)] px-4 py-2 text-sm" onClick={() => void toggleLyrics()}>
            <ScrollText className="w-4 h-4 text-[var(--accent)]" />
            {lyricsOpen ? t("btn_hide_lyrics", language) : t("btn_show_lyrics", language)}
          </button>

          {lyricsOpen && (
            <div className="mt-3 max-h-80 overflow-y-auto rounded-xl border border-border bg-[var(--surface-raised)] p-4 text-sm whitespace-pre-wrap">
              {lyrics && lyrics.trim().length > 0 ? (
                lyrics
              ) : (
                <div className="flex items-center gap-2 text-text-muted">
                  <MicOff className="w-4 h-4 text-[var(--muted)]" />
                  <span>{t("lyrics_unavailable", language)}</span>
                </div>
              )}
            </div>
          )}

          {(shareHint || shareUrl) && (
            <div className="mt-3 rounded-xl border border-[var(--accent-border)] bg-[var(--surface-tinted)] p-3 text-sm">
              {shareHint && <p>{shareHint}</p>}
              {shareUrl && (
                <div className="flex items-center gap-2">
                  <a className="underline" href={shareUrl} target="_blank" rel="noreferrer">{shareUrl}</a>
                  <button className="glassBtn !px-2 !py-1" onClick={() => void navigator.clipboard.writeText(shareUrl)}>Copy link</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
