import { Router } from "express";
import path from "node:path";
import { spawn } from "node:child_process";

const musicDownloadRouter = Router();
const MAX_QUERY_LENGTH = 200;
const MAX_CAPTURE_BYTES = 256 * 1024;
const DOWNLOAD_TIMEOUT_MS = 8 * 60 * 1000;

function appendWithCap(current: string, chunk: Buffer | string, cap = MAX_CAPTURE_BYTES): string {
  const next = current + chunk.toString();
  if (next.length <= cap) return next;
  return next.slice(next.length - cap);
}

function extractLastJsonLine(stdout: string): Record<string, unknown> | null {
  const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      return JSON.parse(lines[i] as string) as Record<string, unknown>;
    } catch {
      // keep scanning older lines
    }
  }
  return null;
}

musicDownloadRouter.post("/download", (req, res) => {
  const songNameRaw = typeof req.body?.songName === "string" ? req.body.songName : "";
  const songName = songNameRaw.replace(/\u0000/g, "").trim();

  if (!songName) {
    res.status(400).json({ code: "SONG_NAME_REQUIRED", message: "songName is required." });
    return;
  }

  if (songName.length > MAX_QUERY_LENGTH) {
    res.status(400).json({ code: "SONG_NAME_TOO_LONG", message: `songName must be <= ${MAX_QUERY_LENGTH} characters.` });
    return;
  }

  const repoRoot = path.resolve(__dirname, "../../..");
  const scriptPath = path.join(repoRoot, "services", "downloader.py");
  const outputDir = path.join(repoRoot, "data", "downloads");

  const py = spawn("python3", [scriptPath, songName, "--output-dir", outputDir], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });

  let stdout = "";
  let stderr = "";
  let finished = false;

  const timer = setTimeout(() => {
    if (finished) return;
    py.kill("SIGKILL");
  }, DOWNLOAD_TIMEOUT_MS);

  py.stdout.on("data", (chunk) => {
    stdout = appendWithCap(stdout, chunk);
  });

  py.stderr.on("data", (chunk) => {
    stderr = appendWithCap(stderr, chunk);
  });

  py.on("error", (error) => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    res.status(500).json({ code: "DOWNLOADER_PROCESS_ERROR", message: error.message });
  });

  py.on("close", (code, signal) => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);

    if (signal) {
      const isTimeout = signal === "SIGKILL";
      res.status(500).json({
        code: isTimeout ? "DOWNLOAD_TIMEOUT" : "DOWNLOAD_ABORTED",
        message: isTimeout ? "Download timed out." : `Downloader terminated by signal ${signal}.`,
      });
      return;
    }

    const payload = extractLastJsonLine(stdout);

    if (code !== 0) {
      res.status(500).json({
        code: "DOWNLOAD_FAILED",
        message:
          (payload?.error as string | undefined)
          || (payload?.message as string | undefined)
          || stderr.trim()
          || "Download failed.",
      });
      return;
    }

    if (!payload) {
      res.status(500).json({ code: "DOWNLOAD_PARSE_FAILED", message: "Downloader response could not be parsed." });
      return;
    }

    res.status(200).json(payload);
  });
});

export default musicDownloadRouter;
