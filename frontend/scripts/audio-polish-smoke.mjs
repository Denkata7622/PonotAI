import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const target = { integratedLufs: -14, truePeakDb: -1.5, loudnessRangeLra: 11 };
const forbiddenFilters = /\b(?:bass|treble|equalizer|firequalizer|superequalizer|anequalizer)=/i;

function binaryFromLocation(location, binary) {
  if (!location) return binary;
  const isWin = process.platform === "win32";
  const exe = isWin && !binary.endsWith(".exe") ? `${binary}.exe` : binary;
  return path.join(location, exe);
}

function run(binary, args, options = {}) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const child = spawn(binary, args, { cwd: options.cwd, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
    }, options.timeoutMs ?? 120000);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

function parseLoudnorm(output) {
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  const parsed = JSON.parse(output.slice(start, end + 1));
  return {
    integratedLufs: Number(parsed.input_i),
    truePeakDb: Number(parsed.input_tp),
    loudnessRangeLra: Number(parsed.input_lra),
  };
}

async function analyze(ffmpeg, inputPath, cwd) {
  const filter = `loudnorm=I=${target.integratedLufs}:TP=${target.truePeakDb}:LRA=${target.loudnessRangeLra}:print_format=json`;
  const result = await run(ffmpeg, ["-hide_banner", "-nostdin", "-i", inputPath, "-af", filter, "-f", "null", "-"], { cwd, timeoutMs: 120000 });
  if (result.code !== 0) throw new Error("loudness analysis failed");
  const parsed = parseLoudnorm(`${result.stderr}\n${result.stdout}`);
  if (!parsed || !Number.isFinite(parsed.integratedLufs)) throw new Error("loudness analysis JSON missing");
  return parsed;
}

async function main() {
  const ffmpeg = binaryFromLocation(process.env.FFMPEG_LOCATION, "ffmpeg");
  const ffprobe = binaryFromLocation(process.env.FFMPEG_LOCATION, "ffprobe");
  const probe = await run(ffmpeg, ["-version"], { timeoutMs: 10000 });
  const probe2 = await run(ffprobe, ["-version"], { timeoutMs: 10000 });
  if (probe.code !== 0 || probe2.code !== 0) {
    console.log("Skipping audio polish smoke: ffmpeg/ffprobe unavailable.");
    return;
  }

  const tempDir = await mkdtemp(path.join(tmpdir(), "ponotai-audio-polish-smoke-"));
  try {
    const quiet = path.join(tempDir, "quiet.mp3");
    const normalized = path.join(tempDir, "quiet-normalized.mp3");
    const generate = await run(ffmpeg, [
      "-y",
      "-hide_banner",
      "-nostdin",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=1000:duration=3",
      "-filter:a",
      "volume=-18dB",
      "-c:a",
      "libmp3lame",
      "-q:a",
      "4",
      quiet,
    ], { cwd: tempDir, timeoutMs: 120000 });
    if (generate.code !== 0) throw new Error("could not generate synthetic test tone");

    const before = await analyze(ffmpeg, quiet, tempDir);
    const polishFilter = `loudnorm=I=${target.integratedLufs}:TP=${target.truePeakDb}:LRA=${target.loudnessRangeLra},alimiter=limit=0.95`;
    if (forbiddenFilters.test(polishFilter)) throw new Error("forbidden EQ filter appeared in smoke command");
    const processResult = await run(ffmpeg, [
      "-y",
      "-hide_banner",
      "-nostdin",
      "-i",
      quiet,
      "-af",
      polishFilter,
      "-c:a",
      "libmp3lame",
      "-q:a",
      "2",
      normalized,
    ], { cwd: tempDir, timeoutMs: 120000 });
    if (processResult.code !== 0) throw new Error("normalization command failed");

    const playable = await run(ffprobe, ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", normalized], { cwd: tempDir, timeoutMs: 30000 });
    if (playable.code !== 0 || !playable.stdout.includes('"codec_type": "audio"')) throw new Error("normalized output is not playable");

    const after = await analyze(ffmpeg, normalized, tempDir);
    const beforeDistance = Math.abs(before.integratedLufs - target.integratedLufs);
    const afterDistance = Math.abs(after.integratedLufs - target.integratedLufs);
    if (!(afterDistance < beforeDistance)) throw new Error(`normalized loudness did not move closer to target (${before.integratedLufs} -> ${after.integratedLufs})`);

    console.log(JSON.stringify({
      ok: true,
      target,
      before,
      after,
      verdict: "technically improved for volume consistency",
    }, null, 2));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

