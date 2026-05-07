"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/src/components/ui/Card";
import { Input } from "@/src/components/ui/Input";
import { Button } from "@/src/components/ui/Button";
import SongReviewModal from "@/components/SongReviewModal";
import type { SongMatch } from "@/features/recognition/api";

type DownloadState = "idle" | "success" | "error";

type ExportSong = SongMatch & {
  coverUrl?: string;
  selected?: boolean;
  source?: string;
};

function songToLine(song: ExportSong): string {
  const title = (song.songName || "").trim();
  const artist = (song.artist || "").trim();
  const fallbackTitle = (song as { title?: string }).title?.trim() || title;
  if (!fallbackTitle) return "";
  return artist ? `${artist} - ${fallbackTitle}` : fallbackTitle;
}

function normalizeSongsForText(songs: ExportSong[]): string[] {
  const deduped = new Set<string>();
  for (const song of songs) {
    if (song.selected === false) continue;
    const normalized = songToLine(song).replace(/\s+/g, " ").trim();
    if (!normalized) continue;
    deduped.add(normalized);
  }
  return Array.from(deduped);
}

function parseImportedSongs(raw: unknown): SongMatch[] {
  const root = Array.isArray(raw)
    ? raw
    : (raw && typeof raw === "object" && Array.isArray((raw as { songs?: unknown }).songs)
      ? (raw as { songs: unknown[] }).songs
      : []);

  const normalizedSongs: SongMatch[] = [];
  for (let index = 0; index < root.length; index += 1) {
    const entry = root[index];
    if (typeof entry === "string") {
      normalizedSongs.push(toSongMatch(entry, index));
      continue;
    }
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    if (item.selected === false) continue;
    const songName = [item.songName, item.title, item.name, item.rawText].find((v) => typeof v === "string" && v.trim()) as string | undefined;
    if (!songName) continue;
    const candidates = Array.isArray(item.coverCandidates) ? item.coverCandidates : [];
    const firstCandidate = candidates.find((candidate) => {
      if (typeof candidate === "string") return candidate.trim().length > 0;
      if (candidate && typeof candidate === "object") {
        const c = candidate as Record<string, unknown>;
        return typeof c.url === "string" || typeof c.coverUrl === "string" || typeof c.imageUrl === "string";
      }
      return false;
    });
    const firstCandidateUrl = typeof firstCandidate === "string"
      ? firstCandidate
      : (firstCandidate && typeof firstCandidate === "object"
        ? (firstCandidate as Record<string, unknown>).url || (firstCandidate as Record<string, unknown>).coverUrl || (firstCandidate as Record<string, unknown>).imageUrl
        : "");
    const albumArtUrl = ((typeof item.coverUrl === "string" && item.coverUrl) || (typeof item.albumArtUrl === "string" && item.albumArtUrl) || (typeof firstCandidateUrl === "string" && firstCandidateUrl) || "").trim();

    normalizedSongs.push({
      songName: songName.trim(),
      artist: typeof item.artist === "string" ? item.artist.trim() : "",
      album: typeof item.album === "string" ? item.album.trim() : "Unknown Album",
      genre: typeof item.genre === "string" ? item.genre : "",
      releaseYear: typeof item.releaseYear === "number" ? item.releaseYear : null,
      platformLinks: typeof item.platformLinks === "object" && item.platformLinks ? item.platformLinks as SongMatch["platformLinks"] : {},
      albumArtUrl,
      confidence: typeof item.confidence === "number" ? item.confidence : 1,
      durationSec: typeof item.durationSec === "number" ? item.durationSec : 0,
      youtubeVideoId: typeof item.youtubeVideoId === "string" ? item.youtubeVideoId : `import-${index}`,
      ...(albumArtUrl ? { coverUrl: albumArtUrl } : {}),
      ...(Array.isArray(item.coverCandidates) ? { coverCandidates: item.coverCandidates } : {}),
      ...(typeof item.rawText === "string" ? { rawText: item.rawText } : {}),
      ...(Array.isArray(item.sourceImageIds) ? { sourceImageIds: item.sourceImageIds } : {}),
      ...(item.source ? { source: item.source } : {}),
      ...(item.selected !== undefined ? { selected: item.selected } : {}),
    } as SongMatch);
  }
  return normalizedSongs;
}

function toSongMatch(query: string, index: number): SongMatch {
  const [left, ...rest] = query.split(" - ");
  const hasDash = rest.length > 0;
  const artist = hasDash ? left.trim() : "";
  const songName = hasDash ? rest.join(" - ").trim() : query.trim();

  return {
    songName,
    artist,
    album: "Unknown Album",
    genre: "",
    releaseYear: null,
    platformLinks: {},
    albumArtUrl: "/album-placeholder.svg",
    confidence: 1,
    durationSec: 0,
    youtubeVideoId: `import-${index}`,
  };
}

function triggerDownload(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function buildLocalDownloaderScript(): string { return `#!/usr/bin/env python3\n# Local-only music downloader for Trackly exports\n\nimport argparse\nimport shutil\nimport subprocess\nimport sys\nimport zipfile\nfrom pathlib import Path\n\n\ndef read_songs(path: Path):\n    songs = []\n    for line in path.read_text(encoding=\"utf-8\").splitlines():\n        song = line.strip()\n        if song:\n            songs.append(song)\n    return songs\n\n\ndef make_safe_name(text: str) -> str:\n    safe = \"\".join(ch if ch.isalnum() or ch in \"._- ()\" else \"_\" for ch in text)\n    return (safe.strip() or \"track\")[:180]\n\n\ndef check_yt_dlp() -> bool:\n    probe = subprocess.run([sys.executable, \"-m\", \"yt_dlp\", \"--version\"], capture_output=True, text=True)\n    if probe.returncode == 0:\n        return True\n    print(\"yt-dlp is not installed for this Python environment.\")\n    print(\"Install with: python3 -m pip install -U \\\"yt-dlp[default]\\\"\")\n    return False\n\n\ndef check_ffmpeg() -> None:\n    if shutil.which(\"ffmpeg\") is None:\n        print(\"Warning: ffmpeg was not found in PATH. MP3 extraction may fail.\")\n\n\ndef resolve_node_runtime() -> list[str]:\n    node_path = shutil.which(\"node\")\n    return [\"--js-runtimes\", f\"node:{node_path}\"] if node_path else []\n\n\ndef run_download(song: str, output_dir: Path, args) -> tuple[bool, str]:\n    safe_name = make_safe_name(song)\n    out_template = str(output_dir / f\"{safe_name}.%(ext)s\")\n    cmd = [\n        sys.executable, \"-m\", \"yt_dlp\", f\"ytsearch1:{song}\",\n        \"-x\", \"--audio-format\", \"mp3\", \"--audio-quality\", \"0\", \"--no-playlist\",\n        \"--print\", \"after_move:filepath\", \"-o\", out_template,\n    ]\n    cmd += resolve_node_runtime()\n\n    if args.cookies:\n        cmd += [\"--cookies\", args.cookies]\n    if args.cookies_from_browser:\n        cmd += [\"--cookies-from-browser\", args.cookies_from_browser]\n    if args.sleep_interval is not None:\n        cmd += [\"--sleep-interval\", str(args.sleep_interval)]\n\n    proc = subprocess.run(cmd, capture_output=True, text=True)\n    output = (proc.stdout + \"\\n\" + proc.stderr).strip()\n\n    if proc.returncode != 0 and \"Sign in to confirm you\'re not a bot\" in output:\n        print(\"YouTube requested a bot check/sign-in. Use local cookies options on your own machine and retry.\")\n        return False, \"BOT_CHECK\"\n\n    if proc.returncode != 0:\n        return False, output\n\n    for line in proc.stdout.splitlines():\n        candidate = line.strip()\n        if candidate.endswith(\".mp3\"):\n            return True, candidate\n    return True, \"\"\n\n\ndef zip_files(paths: list[Path], destination: Path) -> None:\n    with zipfile.ZipFile(destination, \"w\", compression=zipfile.ZIP_DEFLATED) as archive:\n        for file_path in paths:\n            archive.write(file_path, arcname=file_path.name)\n\n\ndef main() -> int:\n    parser = argparse.ArgumentParser(description=\"Download songs locally from songs.txt using yt-dlp.\")\n    parser.add_argument(\"songs_file\", nargs=\"?\", default=\"songs.txt\")\n    parser.add_argument(\"--output-dir\", default=\"downloads\")\n    parser.add_argument(\"--cookies\")\n    parser.add_argument(\"--cookies-from-browser\", choices=[\"chrome\", \"firefox\", \"edge\", \"brave\"])\n    parser.add_argument(\"--sleep-interval\", type=float)\n    parser.add_argument(\"--max-songs\", type=int)\n    parser.add_argument(\"--zip\", action=\"store_true\")\n    parser.add_argument(\"--continue-on-block\", action=\"store_true\")\n    args = parser.parse_args()\n\n    songs_path = Path(args.songs_file)\n    if not songs_path.exists():\n        print(f\"Songs file not found: {songs_path}\")\n        return 1\n\n    if not check_yt_dlp():\n        return 1\n    check_ffmpeg()\n\n    songs = read_songs(songs_path)\n    if args.max_songs and args.max_songs > 0:\n        songs = songs[:args.max_songs]\n    if not songs:\n        print(\"No songs found in input file.\")\n        return 1\n\n    output_dir = Path(args.output_dir)\n    output_dir.mkdir(parents=True, exist_ok=True)\n\n    successes: list[Path] = []\n    failures: list[tuple[str, str]] = []\n\n    for idx, song in enumerate(songs, start=1):\n        print(f\"[{idx}/{len(songs)}] {song}\")\n        ok, details = run_download(song, output_dir, args)\n        if ok:\n            if details:\n                mp3_path = Path(details)\n                if mp3_path.exists():\n                    successes.append(mp3_path)\n            continue\n\n        if details == \"BOT_CHECK\" and not args.continue_on_block:\n            failures.append((song, \"YouTube bot check blocked this request\"))\n            break\n\n        failures.append((song, details[:300] if details else \"Unknown failure\"))\n\n    if args.zip and successes:\n        zip_path = output_dir / \"downloads.zip\"\n        zip_files(successes, zip_path)\n        print(f\"Created ZIP: {zip_path}\")\n\n    print(\"\\nSummary\")\n    print(f\"  Successful: {len(successes)}\")\n    print(f\"  Failed: {len(failures)}\")\n    if failures:\n        for song, reason in failures:\n            print(f\"  - {song}: {reason}\")\n\n    return 0 if successes else 1\n\n\nif __name__ == \"__main__\":\n    raise SystemExit(main())\n`; }

function buildReadmeContent(): string { return `# Local Downloader Package\n\n## Requirements\n- Python 3.10+\n- ffmpeg\n- yt-dlp\n\nInstall yt-dlp:\n\n\`\`\`bash\npython3 -m pip install -U "yt-dlp[default]"\n\`\`\`\n\n## Run\n\`\`\`bash\npython3 download-local.py songs.txt --output-dir downloads\n\`\`\`\n\nWindows:\n\`\`\`powershell\npy download-local.py songs.txt --output-dir downloads\n\`\`\`\n\n## Optional cookies (local-only)\n- Cookies are local-only and should stay on your own machine.\n- Do not upload cookies to Trackly or Railway.\n- Use \`--cookies\` or \`--cookies-from-browser\` only when running locally.\n\n## Troubleshooting\n- **ffmpeg missing**: install ffmpeg and ensure it is in PATH.\n- **yt_dlp missing**: run the install command above in the same Python environment.\n- **YouTube bot check**: retry with local cookies options and avoid server-side downloading.\n- **JS runtime warning**: install Node.js locally so yt-dlp can use a JS runtime for some extractions.\n`; }

export default function DownloadClient() {
  const [songName, setSongName] = useState("");
  const [state, setState] = useState<DownloadState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [importedSongs, setImportedSongs] = useState<SongMatch[]>([]);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [exportSongs, setExportSongs] = useState<ExportSong[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const query = new URLSearchParams(window.location.search).get("query")?.trim() ?? "";
    setSongName(query);
  }, []);

  async function handleJsonImport(file: File | null) {
    if (!file) return;
    setErrorMessage("");
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const songs = parseImportedSongs(parsed);
      if (songs.length === 0) {
        setState("error");
        setErrorMessage("No valid songs were found in this JSON file.");
        return;
      }
      setImportedSongs(songs);
      setShowReviewModal(true);
      setState("idle");
      setExportSongs([]);
    } catch {
      setState("error");
      setErrorMessage("Invalid JSON file. Please upload a valid songs JSON export.");
    }
  }

  function addSingleSongToExport() {
    const query = songName.trim();
    if (!query) {
      setState("error");
      setErrorMessage("Please enter a song name.");
      return;
    }
    setExportSongs([toSongMatch(query, 0)]);
    setState("success");
    setErrorMessage("");
  }

  function handleConfirmSongs(selectedSongs: SongMatch[]) {
    setShowReviewModal(false);
    setExportSongs(selectedSongs as ExportSong[]);
    setState("success");
    setErrorMessage("");
  }

  const songsTxt = useMemo(() => normalizeSongsForText(exportSongs).join("\n"), [exportSongs]);
  const songsJson = useMemo(() => JSON.stringify(exportSongs.map((song) => ({
    songName: song.songName,
    title: (song as { title?: string }).title ?? song.songName,
    artist: song.artist,
    album: song.album,
    albumArtUrl: song.albumArtUrl,
    coverUrl: song.coverUrl ?? song.albumArtUrl,
    coverCandidates: (song as { coverCandidates?: unknown }).coverCandidates ?? [],
    selected: song.selected !== false,
    confidence: song.confidence,
    source: song.source,
    rawText: (song as { rawText?: unknown }).rawText,
    sourceImageIds: (song as { sourceImageIds?: unknown }).sourceImageIds,
    youtubeVideoId: song.youtubeVideoId,
  })), null, 2), [exportSongs]);

  return (
    <section className="mx-auto w-full max-w-2xl px-4 py-10">
      <Card className="space-y-5 rounded-2xl p-6">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Local Download Exporter</h1>
          <p className="mt-1 text-sm text-text-muted">Review songs, then export local downloader files for your own computer.</p>
        </div>
        <div className="space-y-2">
          <label htmlFor="songName" className="text-sm text-text-muted">Single song</label>
          <Input id="songName" value={songName} onChange={(event) => setSongName(event.target.value)} placeholder="e.g. The Weeknd - Blinding Lights" />
        </div>
        <div className="space-y-2">
          <label htmlFor="songsJson" className="text-sm text-text-muted">Import OCR songs JSON</label>
          <input id="songsJson" type="file" accept=".json" onChange={(event) => void handleJsonImport(event.target.files?.[0] ?? null)} className="block w-full rounded-lg border border-border bg-surface-overlay px-3 py-2 text-sm text-text-muted" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={addSingleSongToExport}>Add single song to export</Button>
        </div>

        {state === "success" && exportSongs.length > 0 ? <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">Ready for local download export. Songs: {normalizeSongsForText(exportSongs).length}</div> : null}
        {state === "error" ? <div className="rounded-xl border border-danger bg-surface-raised px-4 py-3 text-sm text-danger">{errorMessage}</div> : null}

        {exportSongs.length > 0 ? <div className="grid gap-2 sm:grid-cols-2">
          <Button onClick={() => triggerDownload("songs.txt", songsTxt, "text/plain;charset=utf-8")}>Export songs.txt</Button>
          <Button onClick={() => triggerDownload("songs.json", songsJson, "application/json;charset=utf-8")}>Export songs.json</Button>
          <Button onClick={() => triggerDownload("download-local.py", buildLocalDownloaderScript(), "text/x-python;charset=utf-8")}>Export local downloader script</Button>
          <Button onClick={() => triggerDownload("README-local-download.md", buildReadmeContent(), "text/markdown;charset=utf-8")}>Export README</Button>
        </div> : null}
      </Card>
      {showReviewModal ? <SongReviewModal songs={importedSongs} onCancel={() => setShowReviewModal(false)} onConfirm={handleConfirmSongs} /> : null}
    </section>
  );
}
