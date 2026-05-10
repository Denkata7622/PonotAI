import { NextResponse } from "next/server";

function sanitizeFileName(input: string): string {
  return (input || "track").replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ").replace(/\s+/g, " ").trim().replace(/[. ]+$/g, "").slice(0, 120) || "track";
}

type YtdlpRunner = (url: string, options: Record<string, unknown>) => Promise<Buffer | { stdout?: Buffer | string }>;

async function getRunner(): Promise<YtdlpRunner> {
  const modName = "yt-dlp-exec";
  const req = (0, eval)("require") as (id: string) => { default?: unknown };
  const mod = req(modName);
  return (mod.default ?? mod) as YtdlpRunner;
}

function toBuffer(output: Buffer | { stdout?: Buffer | string }): Buffer {
  if (Buffer.isBuffer(output)) return output;
  const stdout = output?.stdout;
  if (Buffer.isBuffer(stdout)) return stdout;
  if (typeof stdout === "string") return Buffer.from(stdout);
  return Buffer.alloc(0);
}

export async function handleDownloadPost(request: Request, runner?: YtdlpRunner): Promise<Response> {
  try {
    const body = (await request.json()) as { youtubeId?: string; query?: string };
    const youtubeId = body.youtubeId?.trim();
    const query = body.query?.trim();
    if (!youtubeId && !query) return NextResponse.json({ error: "youtubeId or query is required" }, { status: 400 });

    const ytdlp = runner || await getRunner();
    const target = youtubeId ? `https://www.youtube.com/watch?v=${youtubeId}` : `ytsearch1:${query}`;
    const output = await ytdlp(target, { extractAudio: true, audioFormat: "mp3", audioQuality: 0, noPlaylist: true, quiet: true, output: "-", stdio: ["ignore", "pipe", "ignore"] });

    const audioBuffer = toBuffer(output);
    if (!audioBuffer.length) throw new Error("empty output");

    let titleBase = query || youtubeId || "track";
    if (youtubeId) {
      try {
        const titleOut = await ytdlp(`https://www.youtube.com/watch?v=${youtubeId}`, { print: "title", noPlaylist: true, quiet: true, stdio: ["ignore", "pipe", "ignore"] });
        const title = toBuffer(titleOut).toString("utf-8").trim();
        if (title) titleBase = title;
      } catch {}
    }

    const audioBytes = new Uint8Array(audioBuffer);
    return new Response(audioBytes, { status: 200, headers: { "Content-Type": "audio/mpeg", "Content-Disposition": `attachment; filename="${sanitizeFileName(titleBase)}.mp3"` } });
  } catch {
    return NextResponse.json({ error: "YouTube download blocked—try again later or use your own cookies" }, { status: 503 });
  }
}


export async function POST(request: Request): Promise<Response> {
  return handleDownloadPost(request);
}
