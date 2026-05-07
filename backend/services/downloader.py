#!/usr/bin/env python3
import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
VENDOR_DIR = BACKEND_ROOT / ".python_packages"

if VENDOR_DIR.exists():
    sys.path.insert(0, str(VENDOR_DIR))
    os.environ["PYTHONPATH"] = str(VENDOR_DIR) + os.pathsep + os.environ.get("PYTHONPATH", "")


def sanitize_filename(name: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9._ -]", "", name).strip()
    cleaned = cleaned.replace("..", " ").strip(" .")
    if cleaned in {"", ".", ".."}:
        cleaned = "download"
    return cleaned[:96]


def build_unique_stem(song_name: str) -> str:
    base = sanitize_filename(song_name)
    digest = hashlib.sha1(song_name.encode("utf-8", errors="ignore")).hexdigest()[:8]
    return f"{base}-{int(time.time() * 1000)}-{digest}"


def run(song_name: str, output_dir: Path) -> dict:
    try:
        output_dir.mkdir(parents=True, exist_ok=True)
    except PermissionError as exc:
        raise RuntimeError(f"Output directory is not writable: {output_dir}") from exc

    if not os.access(output_dir, os.W_OK):
        raise RuntimeError(f"Output directory is not writable: {output_dir}")

    unique_stem = build_unique_stem(song_name)
    output_template = output_dir / f"{unique_stem}.%(ext)s"

    cmd = [
        sys.executable,
        "-m",
        "yt_dlp",
        f"ytsearch1:{song_name}",
        "-x",
        "--audio-format",
        "mp3",
        "--audio-quality",
        "0",
        "--no-playlist",
        "--print",
        "after_move:filepath",
        "-o",
        str(output_template),
    ]

    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError((proc.stderr or proc.stdout or "yt-dlp failed").strip())

    file_path = ""
    for line in (proc.stdout or "").splitlines()[::-1]:
        candidate = line.strip()
        if candidate:
            file_path = candidate
            break

    if not file_path:
        matches = sorted(output_dir.glob(f"{unique_stem}*.mp3"), key=lambda p: p.stat().st_mtime, reverse=True)
        if matches:
            file_path = str(matches[0])

    if not file_path:
        raise RuntimeError("Download completed but output file path could not be determined.")

    return {"ok": True, "songName": song_name, "filePath": file_path}


def main() -> int:
    parser = argparse.ArgumentParser(description="Download song audio as MP3 using yt-dlp")
    parser.add_argument("song_name", help="Song name / query to search")
    parser.add_argument("--output-dir", default="backend/data/downloads", help="Output directory for mp3 files")
    args = parser.parse_args()

    try:
        result = run(args.song_name, Path(args.output_dir))
        print(json.dumps(result, ensure_ascii=False), flush=True)
        return 0
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), flush=True)
        return 1


if __name__ == "__main__":
    sys.exit(main())
