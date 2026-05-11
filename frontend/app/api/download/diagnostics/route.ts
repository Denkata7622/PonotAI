import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function run(bin: string, args: string[]): Promise<{ ok: boolean; out: string; code?: string }> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { shell: false });
    let out = "";
    let settled = false;
    const finish = (result: { ok: boolean; out: string; code?: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const push = (chunk: Buffer) => { out = (out + chunk.toString("utf8")).slice(-4096); };
    child.stdout.on("data", push);
    child.stderr.on("data", push);
    child.on("error", (e: NodeJS.ErrnoException) => finish({ ok: false, out: e.message, code: e.code }));
    child.on("close", (c) => finish({ ok: c === 0, out, code: c ? String(c) : undefined }));
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish({ ok: false, out: out || "diagnostic command timed out", code: "TIMEOUT" });
    }, 10000);
  });
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const mode = process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID ? "cloud" : (process.env.NODE_ENV === "development" ? "local" : "unknown");
  const ytdlpPath = process.env.YTDLP_PATH || "yt-dlp";
  const ffmpegBin = process.env.FFMPEG_LOCATION ? path.join(process.env.FFMPEG_LOCATION, "ffmpeg") : "ffmpeg";
  const ffprobeBin = process.env.FFMPEG_LOCATION ? path.join(process.env.FFMPEG_LOCATION, "ffprobe") : "ffprobe";
  const downloader = await run(ytdlpPath, ["--version"]);
  const ffmpeg = await run(ffmpegBin, ["-version"]);
  const ffprobe = await run(ffprobeBin, ["-version"]);
  const warnings: string[] = []; const fixes: string[] = [];
  if (mode !== "local") warnings.push("Cloud server detected. yt-dlp can be installed here, but YouTube may block datacenter IPs. For reliable YouTube fallback, run locally/private network.");
  if (!downloader.ok) fixes.push("Install yt-dlp: macOS brew install yt-dlp; Windows winget install yt-dlp.yt-dlp; Linux python3 -m pip install -U yt-dlp.");
  if (!ffmpeg.ok || !ffprobe.ok) fixes.push("Install ffmpeg/ffprobe: macOS brew install ffmpeg; Windows winget install Gyan.FFmpeg; Linux sudo apt install ffmpeg.");

  const cacheDir = process.env.YTDLP_CACHE_DIR || path.join(tmpdir(), "ponotai-ytdlp-cache");
  let cacheWritable = true; let cacheError = "";
  try { await fs.mkdir(cacheDir, { recursive: true }); const p = path.join(cacheDir, `.w-${Date.now()}`); await fs.writeFile(p, "ok"); await fs.rm(p, { force: true }); } catch (e) { cacheWritable = false; cacheError = e instanceof Error ? e.message : String(e); }
  let tempWritable = true; let tempError = "";
  try { const d = await fs.mkdtemp(path.join(tmpdir(), "ponotai-diag-")); await fs.rm(d, { recursive: true, force: true }); } catch (e) { tempWritable = false; tempError = e instanceof Error ? e.message : String(e); }

  if (url.searchParams.get("probe") === "youtube") warnings.push("Optional YouTube probe is not run by default to keep diagnostics local and safe.");
  return NextResponse.json({ ok: downloader.ok && ffmpeg.ok && ffprobe.ok && cacheWritable && tempWritable, mode, platform: process.platform, nodeVersion: process.version, downloader: { binary: path.basename(ytdlpPath), found: downloader.ok, version: downloader.ok ? downloader.out.trim() : undefined, errorCode: downloader.ok ? undefined : downloader.code, error: downloader.ok ? undefined : downloader.out, fix: downloader.ok ? undefined : "Set YTDLP_PATH to the full binary path if needed." }, ffmpeg: { found: ffmpeg.ok, version: ffmpeg.ok ? ffmpeg.out.split("\n")[0] : undefined, errorCode: ffmpeg.ok ? undefined : ffmpeg.code, error: ffmpeg.ok ? undefined : ffmpeg.out, fix: ffmpeg.ok ? undefined : "Install ffmpeg and/or set FFMPEG_LOCATION." }, ffprobe: { found: ffprobe.ok, version: ffprobe.ok ? ffprobe.out.split("\n")[0] : undefined, errorCode: ffprobe.ok ? undefined : ffprobe.code, error: ffprobe.ok ? undefined : ffprobe.out, fix: ffprobe.ok ? undefined : "Install ffprobe and/or set FFMPEG_LOCATION." }, cache: { dir: cacheDir, writable: cacheWritable, error: cacheError || undefined }, temp: { dir: tmpdir(), writable: tempWritable, error: tempError || undefined }, config: { ytdlpPathConfigured: Boolean(process.env.YTDLP_PATH), ffmpegLocationConfigured: Boolean(process.env.FFMPEG_LOCATION), cookiesConfigured: Boolean(process.env.YTDLP_COOKIES), cacheDirConfigured: Boolean(process.env.YTDLP_CACHE_DIR), timeoutMs: Math.min(600000, Math.max(30000, Number(process.env.YTDLP_TIMEOUT_MS || 180000))) }, warnings, fixes });
}
