#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

function commandPath(binary) {
  return process.env.FFMPEG_LOCATION ? path.join(process.env.FFMPEG_LOCATION, binary) : binary;
}

function check(bin, args) {
  const result = spawnSync(bin, args, { encoding: "utf8", shell: false });
  return {
    ok: result.status === 0,
    out: (result.stdout || result.stderr || "").trim(),
    error: result.error?.message,
  };
}

function printResult(label, result, fix) {
  if (result.ok) {
    console.log(`[ok] ${label} ${result.out.split(/\r?\n/)[0] || "found"}`);
    return true;
  }
  console.log(`[missing] ${label}${result.error ? `: ${result.error}` : ""}`);
  console.log(fix);
  return false;
}

let ok = true;
console.log("Local downloader doctor");
console.log(`[ok] Node ${process.version}`);

ok = printResult(
  "yt-dlp",
  check(process.env.YTDLP_PATH || "yt-dlp", ["--version"]),
  "Fix: Windows `winget install yt-dlp.yt-dlp`; macOS `brew install yt-dlp`; Linux `python3 -m pip install -U yt-dlp`; or set YTDLP_PATH.",
) && ok;

ok = printResult(
  "ffmpeg",
  check(commandPath("ffmpeg"), ["-version"]),
  "Fix: Windows `winget install Gyan.FFmpeg`; macOS `brew install ffmpeg`; Linux `sudo apt install ffmpeg`; or set FFMPEG_LOCATION to the directory containing ffmpeg and ffprobe.",
) && ok;

ok = printResult(
  "ffprobe",
  check(commandPath("ffprobe"), ["-version"]),
  "Fix: install ffmpeg/ffprobe or set FFMPEG_LOCATION to the directory containing both binaries.",
) && ok;

try {
  const dir = await fs.mkdtemp(path.join(tmpdir(), "ponotai-doctor-"));
  await fs.rm(dir, { recursive: true, force: true });
  console.log("[ok] temp directory writable");
} catch (error) {
  ok = false;
  console.log(`[missing] temp directory not writable: ${error instanceof Error ? error.message : String(error)}`);
}

try {
  const cacheDir = process.env.YTDLP_CACHE_DIR || path.join(tmpdir(), "ponotai-ytdlp-cache");
  await fs.mkdir(cacheDir, { recursive: true });
  const probePath = path.join(cacheDir, ".doctor");
  await fs.writeFile(probePath, "ok");
  await fs.rm(probePath, { force: true });
  console.log(`[ok] cache directory writable: ${cacheDir}`);
} catch (error) {
  ok = false;
  console.log(`[missing] cache directory not writable: ${error instanceof Error ? error.message : String(error)}`);
  console.log("Fix: set YTDLP_CACHE_DIR to a writable path or YTDLP_CACHE_DISABLED=true.");
}

process.exit(ok ? 0 : 1);
