import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { NextResponse } from "next/server";
import { binaryFromLocation, clampTimeout, looksOldYtDlp, redactPathForClient, safeBinaryName } from "@/lib/downloadDiagnostics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DIAGNOSTIC_TIMEOUT_MS = 10000;
const OUTPUT_LIMIT = 65536;

type Mode = "local" | "cloud" | "unknown";

type ProbeResult = {
  found: boolean;
  version?: string;
  errorCode?: string;
  error?: string;
  looksStale?: boolean;
};

type EncoderSupport = {
  checked: boolean;
  aac: boolean;
  libmp3lame: boolean;
  errorCode?: string;
};

function capOutput(current: string, next: string): string {
  return (current + next).slice(-OUTPUT_LIMIT);
}

function redactBinaryPath(message: string | undefined, binary: string): string | undefined {
  if (!message) return undefined;
  return message.split(binary).join(safeBinaryName(binary));
}

function detectMode(): Mode {
  if (process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID) return "cloud";
  if (process.env.NODE_ENV === "development") return "local";
  return "unknown";
}

function firstLine(value?: string): string | undefined {
  return value?.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function run(binary: string, args: string[]): Promise<ProbeResult> {
  return new Promise((resolve) => {
    let settled = false;
    let output = "";
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (result: ProbeResult) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    };

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(binary, args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      finish({ found: false, errorCode: err.code || "SPAWN_FAILED", error: redactBinaryPath(err.message, binary) });
      return;
    }

    timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish({ found: false, errorCode: "TIMEOUT", error: redactBinaryPath(output || "diagnostic command timed out", binary) });
    }, DIAGNOSTIC_TIMEOUT_MS);

    const push = (chunk: Buffer) => {
      output = capOutput(output, chunk.toString("utf8"));
    };
    child.stdout?.on("data", push);
    child.stderr?.on("data", push);
    child.on("error", (error: NodeJS.ErrnoException) => {
      finish({ found: false, errorCode: error.code || "SPAWN_FAILED", error: redactBinaryPath(error.message, binary) });
    });
    child.on("close", (code) => {
      if (code === 0) {
        finish({ found: true, version: output.trim() || "installed" });
        return;
      }
      finish({ found: false, errorCode: code === null ? "CLOSED" : String(code), error: redactBinaryPath(output.trim() || `command exited with code ${code}`, binary) });
    });
  });
}

async function detectFfmpegEncoders(ffmpegBinary: string, ffmpeg: ProbeResult): Promise<EncoderSupport> {
  if (!ffmpeg.found) return { checked: false, aac: false, libmp3lame: false, errorCode: "FFMPEG_UNAVAILABLE" };
  const encoders = await run(ffmpegBinary, ["-hide_banner", "-encoders"]);
  if (!encoders.found) return { checked: false, aac: false, libmp3lame: false, errorCode: encoders.errorCode };
  const output = (encoders.version || "").toLowerCase();
  return {
    checked: true,
    aac: /\baac\b/.test(output),
    libmp3lame: output.includes("libmp3lame"),
  };
}

async function checkWritableDir(dir: string, prefix: string): Promise<{ dir: string; writable: boolean; error?: string }> {
  try {
    await fs.mkdir(dir, { recursive: true });
    const probePath = path.join(dir, `.${prefix}-${Date.now()}`);
    await fs.writeFile(probePath, "ok");
    await fs.rm(probePath, { force: true });
    return { dir: redactPathForClient(dir), writable: true };
  } catch (error) {
    return { dir: redactPathForClient(dir), writable: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function toolFixes(mode: Mode, downloader: ProbeResult, ffmpeg: ProbeResult, ffprobe: ProbeResult): string[] {
  const fixes: string[] = [];
  if (!downloader.found) {
    fixes.push(mode === "cloud"
      ? "On Railway frontend service, ensure Dockerfile is used and set YTDLP_PATH=/usr/local/bin/yt-dlp, or install yt-dlp in the runtime image."
      : "Install yt-dlp locally. Windows: winget install yt-dlp.yt-dlp. macOS: brew install yt-dlp. Linux: python3 -m pip install -U yt-dlp. Or set YTDLP_PATH to the binary.");
  }
  if (!ffmpeg.found || !ffprobe.found) {
    fixes.push(mode === "cloud"
      ? "On Railway frontend service, ensure frontend/Dockerfile is used and set FFMPEG_LOCATION=/usr/bin."
      : "Install ffmpeg/ffprobe locally. Windows: winget install Gyan.FFmpeg. macOS: brew install ffmpeg. Linux: sudo apt install ffmpeg. Or set FFMPEG_LOCATION to their directory.");
  }
  return unique(fixes);
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const mode = detectMode();
  const ytdlpPath = process.env.YTDLP_PATH || "yt-dlp";
  const ffmpegBinary = binaryFromLocation(process.env.FFMPEG_LOCATION, "ffmpeg");
  const ffprobeBinary = binaryFromLocation(process.env.FFMPEG_LOCATION, "ffprobe");

  const [downloader, ffmpeg, ffprobe] = await Promise.all([
    run(ytdlpPath, ["--version"]),
    run(ffmpegBinary, ["-version"]),
    run(ffprobeBinary, ["-version"]),
  ]);

  const cacheDir = process.env.YTDLP_CACHE_DIR || path.join(tmpdir(), "ponotai-ytdlp-cache");
  const [cache, temp] = await Promise.all([
    checkWritableDir(cacheDir, "ponotai-cache"),
    checkWritableDir(tmpdir(), "ponotai-temp"),
  ]);
  const ffmpegEncoders = await detectFfmpegEncoders(ffmpegBinary, ffmpeg);

  if (downloader.found) downloader.looksStale = looksOldYtDlp(downloader.version);

  const warnings: string[] = [];
  if (mode === "cloud") {
    warnings.push("Cloud frontend service detected. yt-dlp can be installed here, but YouTube may block datacenter IPs. For reliable YouTube fallback, run locally/private network.");
  }
  if (downloader.looksStale) {
    warnings.push("yt-dlp is installed but appears old. YouTube extraction may fail. Update yt-dlp.");
  }
  if (url.searchParams.get("probe") === "youtube") {
    warnings.push("Optional YouTube probe is not run by default to keep diagnostics local and safe.");
  }

  const fixes = toolFixes(mode, downloader, ffmpeg, ffprobe);
  if (!cache.writable) fixes.push("Set YTDLP_CACHE_DIR to a writable directory or disable cache with YTDLP_CACHE_DISABLED=true.");
  if (!temp.writable) fixes.push("Set the runtime temporary directory to a writable location.");

  return NextResponse.json({
    ok: downloader.found && ffmpeg.found && ffprobe.found && cache.writable && temp.writable,
    mode,
    platform: process.platform,
    nodeVersion: process.version,
    runningInFrontendService: true,
    serviceRole: "frontend-download-route",
    downloader: {
      binary: safeBinaryName(ytdlpPath),
      found: downloader.found,
      version: downloader.found ? downloader.version?.trim() : undefined,
      looksStale: Boolean(downloader.looksStale),
      errorCode: downloader.found ? undefined : downloader.errorCode,
      error: downloader.found ? undefined : downloader.error,
      fix: downloader.found ? undefined : fixes.find((fix) => fix.includes("yt-dlp")),
    },
    ffmpeg: {
      found: ffmpeg.found,
      version: ffmpeg.found ? firstLine(ffmpeg.version) : undefined,
      errorCode: ffmpeg.found ? undefined : ffmpeg.errorCode,
      error: ffmpeg.found ? undefined : ffmpeg.error,
      fix: ffmpeg.found ? undefined : fixes.find((fix) => fix.includes("ffmpeg") || fix.includes("FFMPEG_LOCATION")),
    },
    ffprobe: {
      found: ffprobe.found,
      version: ffprobe.found ? firstLine(ffprobe.version) : undefined,
      errorCode: ffprobe.found ? undefined : ffprobe.errorCode,
      error: ffprobe.found ? undefined : ffprobe.error,
      fix: ffprobe.found ? undefined : fixes.find((fix) => fix.includes("ffmpeg") || fix.includes("FFMPEG_LOCATION")),
    },
    cache,
    temp,
    config: {
      envFlagsPresent: {
        YTDLP_PATH: Boolean(process.env.YTDLP_PATH),
        FFMPEG_LOCATION: Boolean(process.env.FFMPEG_LOCATION),
        YTDLP_COOKIES: Boolean(process.env.YTDLP_COOKIES),
        YTDLP_CACHE_DIR: Boolean(process.env.YTDLP_CACHE_DIR),
        YTDLP_CACHE_DISABLED: Boolean(process.env.YTDLP_CACHE_DISABLED),
        YTDLP_TIMEOUT_MS: Boolean(process.env.YTDLP_TIMEOUT_MS),
      },
      ytdlpPathConfigured: Boolean(process.env.YTDLP_PATH),
      ffmpegLocationConfigured: Boolean(process.env.FFMPEG_LOCATION),
      cookiesConfigured: Boolean(process.env.YTDLP_COOKIES),
      cacheDirConfigured: Boolean(process.env.YTDLP_CACHE_DIR),
      cacheDisabled: process.env.YTDLP_CACHE_DISABLED === "true",
      timeoutMs: clampTimeout(process.env.YTDLP_TIMEOUT_MS),
    },
    frontendVsBackend: {
      downloaderRouteRunsOn: "frontend service",
      backendPythonPackagesMatter: false,
      frontendDockerfileMatters: true,
    },
    metadataPostProcessing: {
      available: ffmpeg.found && ffprobe.found,
      requires: ["ffmpeg", "ffprobe"],
    },
    loudnessNormalization: {
      available: ffmpeg.found,
      defaultEnabled: false,
      usesEq: false,
    },
    audioAnalysisAvailable: ffmpeg.found && ffprobe.found,
    loudnessNormalizationAvailable: ffmpeg.found,
    supportedAudioProfiles: [
      "compatibility-mp3",
      "phone-aac-preserve",
      "phone-aac-normalized",
      "mp3-normalized",
      "analysis-only",
    ],
    supportedAudioPolishModes: [
      "metadata-only",
      "normalize-loudness",
      "normalize-loudness-safe",
    ],
    ffmpegEncoders,
    warnings: unique(warnings),
    fixes: unique(fixes),
  });
}
