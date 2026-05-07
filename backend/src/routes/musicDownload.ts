import { Router } from "express";
import path from "node:path";
import { spawn } from "node:child_process";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const archiver = require("archiver") as (format: "zip", options: { zlib: { level: number } }) => {
  on: (event: string, cb: (error: Error) => void) => void;
  pipe: (stream: NodeJS.WritableStream) => void;
  file: (filename: string, data: { name: string }) => void;
  finalize: () => Promise<void>;
};
import fs from "node:fs";
import fsp from "node:fs/promises";

const musicDownloadRouter = Router();
const MAX_QUERY_LENGTH = 200;
const MAX_CAPTURE_BYTES = 256 * 1024;
const DOWNLOAD_TIMEOUT_MS = 8 * 60 * 1000;
const ZIP_RETENTION_MS = 24 * 60 * 60 * 1000; // ZIP files are temporary artifacts and are cleaned after this retention window.

const backendRoot = process.cwd();
const scriptPath = path.join(backendRoot, "services", "downloader.py");
const downloadsDir = path.join(backendRoot, "data", "downloads");

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

function sanitizeDownloadPath(rawPath: string): string | null {
  const base = path.basename(rawPath || "").replace(/\u0000/g, "").trim();
  if (!base) return null;
  const resolved = path.resolve(downloadsDir, base);
  const relative = path.relative(downloadsDir, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return resolved;
}

function safeTrimmedDetails(input: unknown): string {
  const text = String(input ?? "").replace(/\u0000/g, "").trim();
  return text.slice(0, 1200);
}

async function cleanupOldZipFiles(): Promise<void> {
  await fsp.mkdir(downloadsDir, { recursive: true });
  try {
    const entries = await fsp.readdir(downloadsDir, { withFileTypes: true });
    const cutoff = Date.now() - ZIP_RETENTION_MS;
    await Promise.all(entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".zip"))
      .map(async (entry) => {
        const targetPath = path.join(downloadsDir, entry.name);
        try {
          const stats = await fsp.stat(targetPath);
          if (stats.mtimeMs < cutoff) {
            await fsp.unlink(targetPath);
          }
        } catch (error) {
          console.warn("[music/zip-folder] Could not cleanup zip", targetPath, error);
        }
      }));
  } catch (error) {
    console.warn("[music/zip-folder] Cleanup scan failed", error);
  }
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

  const outputDir = path.join(backendRoot, "data", "downloads");
  const run = async (): Promise<void> => {
    await fsp.mkdir(downloadsDir, { recursive: true });
    try {
      await fsp.access(scriptPath, fs.constants.R_OK);
    } catch {
      res.status(500).json({
        code: "DOWNLOADER_SCRIPT_NOT_FOUND",
        message: "Downloader script was not found.",
        details: `Expected downloader.py at ${safeTrimmedDetails(scriptPath)}`,
      });
      return;
    }

    const py = spawn("python3", [scriptPath, songName, "--output-dir", outputDir], {
      cwd: backendRoot,
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
        const details = safeTrimmedDetails(
          (payload?.error as string | undefined)
            || (payload?.message as string | undefined)
            || stderr
            || stdout
            || "Download failed.",
        );
        res.status(500).json({
          code: "DOWNLOAD_FAILED",
          message: "Downloader failed.",
          details,
        });
        return;
      }

      if (!payload) {
        res.status(500).json({ code: "DOWNLOAD_PARSE_FAILED", message: "Downloader response could not be parsed." });
        return;
      }

      res.status(200).json(payload);
    });
  };

  run().catch((error) => {
    res.status(500).json({
      code: "DOWNLOAD_PREP_FAILED",
      message: error instanceof Error ? error.message : "Unable to prepare download.",
    });
  });
});

musicDownloadRouter.get("/downloader-health", async (_req, res) => {
  const details: string[] = [];
  const checkCommand = async (cmd: string, args: string[]) => new Promise<{ ok: boolean; output: string }>((resolve) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env } });
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk) => { out = appendWithCap(out, chunk); });
    child.stderr.on("data", (chunk) => { err = appendWithCap(err, chunk); });
    child.on("error", (error) => resolve({ ok: false, output: error.message }));
    child.on("close", (code) => resolve({ ok: code === 0, output: safeTrimmedDetails(err || out) }));
  });

  const pythonProbe = await checkCommand("python3", ["--version"]);
  const ytDlpProbe = await checkCommand("python3", ["-m", "yt_dlp", "--version"]);
  const ffmpegProbe = await checkCommand("ffmpeg", ["-version"]);
  const downloaderScriptProbe = await fsp.access(scriptPath, fs.constants.R_OK)
    .then(() => ({ ok: true, output: "" }))
    .catch(() => ({ ok: false, output: `Expected downloader.py at ${safeTrimmedDetails(scriptPath)}` }));

  if (!pythonProbe.ok) details.push(`python: ${pythonProbe.output}`);
  if (!ytDlpProbe.ok) details.push(`yt-dlp: ${ytDlpProbe.output}`);
  if (!ffmpegProbe.ok) details.push(`ffmpeg: ${ffmpegProbe.output}`);
  if (!downloaderScriptProbe.ok) details.push(`downloaderScript: ${downloaderScriptProbe.output}`);

  const ok = pythonProbe.ok && ytDlpProbe.ok && ffmpegProbe.ok && downloaderScriptProbe.ok;
  res.status(ok ? 200 : 503).json({
    ok,
    python: pythonProbe.ok,
    ytDlp: ytDlpProbe.ok,
    ffmpeg: ffmpegProbe.ok,
    downloaderScript: downloaderScriptProbe.ok,
    ...(details.length > 0 ? { details } : {}),
  });
});

musicDownloadRouter.post("/zip-folder", async (req, res) => {
  const filePaths: unknown[] | null = Array.isArray(req.body?.filePaths) ? (req.body.filePaths as unknown[]) : null;
  if (!filePaths) {
    res.status(400).json({ code: "FILE_PATHS_REQUIRED", message: "filePaths must be an array." });
    return;
  }

  await cleanupOldZipFiles();
  await fsp.mkdir(downloadsDir, { recursive: true });

  const safePaths = Array.from(new Set(filePaths
     .filter((item: unknown): item is string => typeof item === "string")
    .map((item: string) => sanitizeDownloadPath(item))
    .filter((item: string | null): item is string => Boolean(item))
    .filter((item: string) => path.extname(item).toLowerCase() === ".mp3")));

  const existingPaths: string[] = [];
  const missingFiles: string[] = [];
  for (const safePath of safePaths) {
    try {
      await fsp.access(safePath, fs.constants.R_OK);
      existingPaths.push(safePath);
    } catch {
      missingFiles.push(path.basename(safePath));
    }
  }

  if (existingPaths.length === 0) {
    res.status(400).json({ code: "NO_VALID_FILES", message: "No valid downloadable files were found.", missingFiles });
    return;
  }

  const zipName = `downloads-${Date.now()}.zip`;
  const zipPath = path.join(downloadsDir, zipName);

  try {
    await new Promise<void>((resolve, reject) => {
      const output = fs.createWriteStream(zipPath);
      const archive = archiver("zip", { zlib: { level: 9 } });
      output.on("close", () => resolve());
      output.on("error", (error: Error) => reject(error));
      archive.on("error", (error: Error) => reject(error));
      archive.pipe(output);
      for (const filePath of existingPaths) {
        archive.file(filePath, { name: path.basename(filePath) });
      }
      archive.finalize().catch(reject);
    });

    res.status(200).json({
      ok: true,
      zipFileName: zipName,
      zipUrl: `/api/music/files/${encodeURIComponent(zipName)}`,
      includedCount: existingPaths.length,
      missingFiles,
    });
  } catch (error) {
    res.status(500).json({
      code: "ZIP_CREATION_FAILED",
      message: error instanceof Error ? error.message : "Failed to create ZIP archive.",
      missingFiles,
    });
  }
});

musicDownloadRouter.get("/files/:fileName", (req, res) => {
  const safePath = sanitizeDownloadPath(req.params.fileName);
  if (!safePath) {
    res.status(400).json({ code: "INVALID_FILE", message: "Invalid file path." });
    return;
  }

  if (path.extname(safePath).toLowerCase() !== ".zip") {
    res.status(400).json({ code: "UNSUPPORTED_FILE", message: "Only ZIP downloads are supported." });
    return;
  }

  res.download(safePath, path.basename(safePath), (error) => {
    if (!error) return;

    if (res.headersSent) {
      console.warn("[music/files] Download failed after headers were sent", error);
      return;
    }

    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      res.status(404).json({ code: "FILE_NOT_FOUND", message: "Requested file was not found." });
      return;
    }

    res.status(500).json({ code: "FILE_DOWNLOAD_FAILED", message: "Unable to serve the requested file." });
  });
});

export default musicDownloadRouter;
