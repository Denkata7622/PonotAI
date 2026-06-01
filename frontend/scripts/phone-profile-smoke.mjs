import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const forbiddenFilters = /\b(?:bass|treble|equalizer|firequalizer|superequalizer|anequalizer)=/i;

function binaryFromLocation(location, binary) {
  if (!location) return binary;
  const isWin = process.platform === "win32";
  const exe = isWin && !binary.endsWith(".exe") ? `${binary}.exe` : binary;
  return path.join(location, exe);
}

function run(binary, args, options = {}) {
  if (forbiddenFilters.test(args.join(" "))) throw new Error("forbidden EQ filter appeared in phone profile smoke command");
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

async function probe(ffprobe, inputPath, cwd) {
  const result = await run(ffprobe, ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", inputPath], { cwd, timeoutMs: 30000 });
  if (result.code !== 0) throw new Error(`ffprobe failed for ${path.basename(inputPath)}`);
  return JSON.parse(result.stdout);
}

function audioCodec(probeJson) {
  return probeJson.streams?.find((stream) => stream.codec_type === "audio")?.codec_name;
}

function hasAttachedCover(probeJson) {
  return Boolean(probeJson.streams?.some((stream) => stream.codec_type === "video" && Number(stream.disposition?.attached_pic || 0) === 1));
}

function tagValue(probeJson, name) {
  const tags = probeJson.format?.tags || {};
  const found = Object.entries(tags).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return found?.[1];
}

async function main() {
  const ffmpeg = binaryFromLocation(process.env.FFMPEG_LOCATION, "ffmpeg");
  const ffprobe = binaryFromLocation(process.env.FFMPEG_LOCATION, "ffprobe");
  const ffmpegProbe = await run(ffmpeg, ["-version"], { timeoutMs: 10000 });
  const ffprobeProbe = await run(ffprobe, ["-version"], { timeoutMs: 10000 });
  if (ffmpegProbe.code !== 0 || ffprobeProbe.code !== 0) {
    console.log("Skipping phone profile smoke: ffmpeg/ffprobe unavailable.");
    return;
  }

  const tempDir = await mkdtemp(path.join(tmpdir(), "ponotai-phone-profile-smoke-"));
  const results = [];
  try {
    const cover = path.join(tempDir, "cover.jpg");
    const coverResult = await run(ffmpeg, [
      "-y",
      "-hide_banner",
      "-nostdin",
      "-f",
      "lavfi",
      "-i",
      "color=c=0x28415c:s=600x600:d=0.1",
      "-frames:v",
      "1",
      "-q:v",
      "3",
      cover,
    ], { cwd: tempDir, timeoutMs: 60000 });
    if (coverResult.code !== 0) throw new Error("could not generate test cover");

    const aacSource = path.join(tempDir, "source-aac.m4a");
    const aacOutput = path.join(tempDir, "phone-preserve-aac.m4a");
    const aacGenerate = await run(ffmpeg, [
      "-y",
      "-hide_banner",
      "-nostdin",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=660:duration=2",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      aacSource,
    ], { cwd: tempDir, timeoutMs: 120000 });
    if (aacGenerate.code !== 0) throw new Error("could not generate AAC/M4A test tone");
    const aacPreserveArgs = [
      "-y",
      "-hide_banner",
      "-nostdin",
      "-i",
      aacSource,
      "-i",
      cover,
      "-map",
      "0:a:0",
      "-map",
      "1:v:0",
      "-map_metadata",
      "-1",
      "-metadata",
      "title=Phone Tone",
      "-metadata",
      "artist=Trackly Test",
      "-metadata:s:v",
      "title=Album cover",
      "-metadata:s:v",
      "comment=Cover (Front)",
      "-disposition:v:0",
      "attached_pic",
      "-c:a",
      "copy",
      "-c:v",
      "mjpeg",
      "-f",
      "mp4",
      aacOutput,
    ];
    const aacPreserve = await run(ffmpeg, aacPreserveArgs, { cwd: tempDir, timeoutMs: 120000 });
    if (aacPreserve.code !== 0) throw new Error("AAC preserve/remux command failed");
    const aacProbe = await probe(ffprobe, aacOutput, tempDir);
    if (audioCodec(aacProbe) !== "aac") throw new Error("AAC preserve output is not AAC");
    if (tagValue(aacProbe, "title") !== "Phone Tone") throw new Error("M4A title metadata missing");
    if (!hasAttachedCover(aacProbe)) throw new Error("M4A cover art was not embedded");
    results.push({ profile: "phone-aac-preserve", source: "aac", output: "m4a", audioStreamCopied: aacPreserveArgs.includes("copy"), coverEmbedded: true });

    const mp3Source = path.join(tempDir, "source-mp3.mp3");
    const mp3Output = path.join(tempDir, "phone-preserve-mp3.mp3");
    const mp3Generate = await run(ffmpeg, [
      "-y",
      "-hide_banner",
      "-nostdin",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=880:duration=2",
      "-c:a",
      "libmp3lame",
      "-q:a",
      "4",
      mp3Source,
    ], { cwd: tempDir, timeoutMs: 120000 });
    if (mp3Generate.code !== 0) throw new Error("could not generate MP3 test tone");
    const mp3PreserveArgs = [
      "-y",
      "-hide_banner",
      "-nostdin",
      "-i",
      mp3Source,
      "-map",
      "0:a:0",
      "-map_metadata",
      "-1",
      "-metadata",
      "title=MP3 Phone Tone",
      "-metadata",
      "artist=Trackly Test",
      "-id3v2_version",
      "3",
      "-write_id3v1",
      "1",
      "-c:a",
      "copy",
      mp3Output,
    ];
    const mp3Preserve = await run(ffmpeg, mp3PreserveArgs, { cwd: tempDir, timeoutMs: 120000 });
    if (mp3Preserve.code !== 0) throw new Error("MP3 preserve command failed");
    const mp3Probe = await probe(ffprobe, mp3Output, tempDir);
    if (audioCodec(mp3Probe) !== "mp3") throw new Error("MP3 phone preserve should remain MP3");
    results.push({ profile: "phone-aac-preserve", source: "mp3", output: "mp3", audioStreamCopied: mp3PreserveArgs.includes("copy") });

    const opusSource = path.join(tempDir, "source-opus.webm");
    const opusOutput = path.join(tempDir, "phone-opus-to-aac.m4a");
    const opusGenerate = await run(ffmpeg, [
      "-y",
      "-hide_banner",
      "-nostdin",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=2",
      "-c:a",
      "libopus",
      "-b:a",
      "96k",
      opusSource,
    ], { cwd: tempDir, timeoutMs: 120000 });
    if (opusGenerate.code === 0) {
      const opusTranscodeArgs = [
        "-y",
        "-hide_banner",
        "-nostdin",
        "-i",
        opusSource,
        "-map",
        "0:a:0",
        "-map_metadata",
        "-1",
        "-metadata",
        "title=Opus Phone Tone",
        "-metadata",
        "artist=Trackly Test",
        "-c:a",
        "aac",
        "-b:a",
        "256k",
        "-f",
        "mp4",
        opusOutput,
      ];
      const opusTranscode = await run(ffmpeg, opusTranscodeArgs, { cwd: tempDir, timeoutMs: 120000 });
      if (opusTranscode.code !== 0) throw new Error("Opus to AAC phone transcode failed");
      const opusProbe = await probe(ffprobe, opusOutput, tempDir);
      if (audioCodec(opusProbe) !== "aac") throw new Error("Opus phone profile output should be AAC");
      results.push({ profile: "phone-aac-preserve", source: "opus", output: "m4a", reencodedForCompatibility: true });
    } else {
      results.push({ profile: "phone-aac-preserve", source: "opus", skipped: "libopus unavailable" });
    }

    console.log(JSON.stringify({
      ok: true,
      verdict: "phone profile smoke passed without EQ filters",
      results,
    }, null, 2));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
