import { promises as fs } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const YOUTUBE_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;
const STDERR_LIMIT = 16_384;

function sanitizeFileName(input: string): string {
  return (input || "track").replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ").replace(/\s+/g, " ").trim().replace(/[. ]+$/g, "").slice(0, 120) || "track";
}

function contentDisposition(filename: string): string {
  const safe = sanitizeFileName(filename);
  return `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

export type YtdlpRunner = (args: string[], options: { cwd: string; timeoutMs: number }) => Promise<{ code: number; stdout: string; stderr: string }>;

const defaultRunner: YtdlpRunner = (args, options) => new Promise((resolve, reject) => {
  const bin = process.env.YTDLP_PATH || "yt-dlp";
  const child = spawn(bin, args, { cwd: options.cwd, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  let didTimeout = false;
  const push = (curr: string, next: string) => (curr + next).slice(-STDERR_LIMIT);
  child.stdout.on("data", (chunk: Buffer) => { stdout = push(stdout, chunk.toString("utf8")); });
  child.stderr.on("data", (chunk: Buffer) => { stderr = push(stderr, chunk.toString("utf8")); });
  const timer = setTimeout(() => {
    didTimeout = true;
    child.kill("SIGTERM");
  }, options.timeoutMs);
  child.on("error", (error) => { clearTimeout(timer); reject(error); });
  child.on("close", (code) => {
    clearTimeout(timer);
    if (didTimeout) stderr = `yt-dlp timed out after ${options.timeoutMs}ms`;
    resolve({ code: didTimeout ? 124 : (code ?? 1), stdout, stderr });
  });
});

function firstUsefulDetail(message?: string): string {
  const line = (message || "").split("\n").map((part) => part.trim()).find(Boolean);
  return (line || "unknown error").slice(0, 500);
}

export async function handleDownloadPost(request: Request, runner: YtdlpRunner = defaultRunner): Promise<Response> {
  let body: { youtubeId?: string; query?: string };
  try {
    body = (await request.json()) as { youtubeId?: string; query?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let tempDir = "";
  try {
    const youtubeId = body.youtubeId?.trim();
    const query = body.query?.trim();
    if (!youtubeId && !query) return NextResponse.json({ error: "youtubeId or query is required" }, { status: 400 });
    if (youtubeId && !YOUTUBE_ID_REGEX.test(youtubeId)) return NextResponse.json({ error: "Invalid youtubeId" }, { status: 400 });

    const target = youtubeId ? `https://www.youtube.com/watch?v=${youtubeId}` : `ytsearch1:${query}`;
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "ponotai-ytdlp-"));
    const outputTemplate = path.join(tempDir, "%(title).200B.%(ext)s");

    const args = ["--no-playlist", "--no-progress", "-f", "bestaudio/best", "-x", "--audio-format", "mp3", "--audio-quality", "0", "-o", outputTemplate];
    if (process.env.YTDLP_COOKIES) args.push("--cookies", process.env.YTDLP_COOKIES);
    if (process.env.FFMPEG_LOCATION) args.push("--ffmpeg-location", process.env.FFMPEG_LOCATION);
    args.push(target);

    const result = await runner(args, { cwd: tempDir, timeoutMs: 180_000 });
    if (result.code !== 0) throw new Error(firstUsefulDetail(result.stderr || result.stdout));

    const entries = await fs.readdir(tempDir);
    const mp3Name = entries.find((entry) => entry.toLowerCase().endsWith(".mp3"));
    if (!mp3Name) throw new Error("yt-dlp completed without producing an mp3 file");

    const filePath = path.join(tempDir, mp3Name);
    const audio = await fs.readFile(filePath);
    return new Response(new Uint8Array(audio), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(audio.byteLength),
        "Content-Disposition": contentDisposition(mp3Name),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: "YouTube download failed. Update yt-dlp, check ffmpeg, or provide cookies locally.", detail: firstUsefulDetail(error instanceof Error ? error.message : String(error)) }, { status: 503 });
  } finally {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

export async function POST(request: Request): Promise<Response> {
  return handleDownloadPost(request);
}
