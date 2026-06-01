import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import {
  buildAudioPolishFilter,
  buildFfprobeArgs,
  buildLoudnessAnalysisArgs,
  buildLoudnormFilter,
  buildPostProcessArgs,
  parseFfprobeOutput,
  parseLoudnormJson,
  planAudioExport,
  postProcessAudio,
  resolvePostProcessingOptions,
  type ProcessRunner,
} from "../lib/audioPostProcessor";
import { resolveTrackMetadata } from "../lib/trackMetadata";

const metadata = resolveTrackMetadata({ title: "Lose Yourself", artist: "Eminem", album: "8 Mile", genre: "Hip-Hop", year: "2002" });

test("metadata-only ffmpeg args copy audio and write ID3v2.3 without EQ", () => {
  const args = buildPostProcessArgs({
    inputPath: "C:\\tmp path\\input.mp3",
    outputPath: "C:\\tmp path\\output.mp3",
    metadata,
  });
  assert.ok(args.includes("-map_metadata"));
  assert.ok(args.includes("-1"));
  assert.ok(args.includes("title=Lose Yourself"));
  assert.ok(args.includes("artist=Eminem"));
  assert.ok(args.includes("-id3v2_version"));
  assert.ok(args.includes("3"));
  assert.ok(args.includes("-write_id3v1"));
  assert.ok(args.includes("-c:a"));
  assert.ok(args.includes("copy"));
  assert.equal(args.includes("libmp3lame"), false);
  assert.doesNotMatch(args.join(" "), /\b(?:bass|treble|equalizer|firequalizer)=/i);
});

test("cover ffmpeg args attach front cover stream", () => {
  const args = buildPostProcessArgs({
    inputPath: "input.mp3",
    outputPath: "output.mp3",
    coverPath: "cover.jpg",
    metadata,
  });
  assert.deepEqual(args.slice(args.indexOf("-map"), args.indexOf("-map") + 4), ["-map", "0:a:0", "-map", "1:v:0"]);
  assert.ok(args.includes("attached_pic"));
  assert.ok(args.includes("-c:v"));
  assert.ok(args.includes("mjpeg"));
});

test("loudness args use loudnorm, re-encode, and never add EQ filters", () => {
  const target = { integrated: -14, truePeak: -1.5, lra: 11 };
  const filter = buildLoudnormFilter(target, { measuredI: -18, measuredTP: -2, measuredLRA: 8, measuredThresh: -28, offset: 1.2 });
  const args = buildPostProcessArgs({
    inputPath: "input.mp3",
    outputPath: "output.mp3",
    metadata,
    normalizeFilter: filter,
  });
  assert.match(filter, /loudnorm=I=-14:TP=-1.5:LRA=11/);
  assert.ok(args.includes("-af"));
  assert.ok(args.includes("libmp3lame"));
  assert.ok(args.includes("-q:a"));
  assert.doesNotMatch(args.join(" "), /\b(?:bass|treble|equalizer|firequalizer)=/i);
});

test("safe mode adds conservative limiter without EQ filters", () => {
  const filter = buildAudioPolishFilter({
    options: resolvePostProcessingOptions({
      audioPolish: { mode: "normalize-loudness-safe" },
    }).audioPolish,
    target: { integrated: -14, truePeak: -1.5, lra: 11 },
  });
  assert.match(filter || "", /loudnorm=I=-14:TP=-1.5:LRA=11/);
  assert.match(filter || "", /alimiter=limit=0\.95/);
  assert.doesNotMatch(filter || "", /\b(?:bass|treble|equalizer|firequalizer|superequalizer|anequalizer)=/i);
});

test("loudness analysis parser handles ffmpeg JSON", () => {
  const parsed = parseLoudnormJson(`noise\n{
    "input_i": "-19.42",
    "input_tp": "-1.12",
    "input_lra": "7.30",
    "input_thresh": "-29.40",
    "target_offset": "0.42"
  }\n`);
  assert.equal(parsed?.measuredI, -19.42);
  assert.equal(parsed?.measuredTP, -1.12);
  assert.equal(parsed?.offset, 0.42);
  assert.equal(parseLoudnormJson("not json"), undefined);
});

test("ffprobe parser handles tags, audio, cover, and invalid JSON", () => {
  const probe = parseFfprobeOutput(JSON.stringify({
    format: { duration: "213.2", bit_rate: "192000", tags: { Title: "Lose Yourself", ARTIST: "Eminem" } },
    streams: [
      { codec_type: "audio", codec_name: "mp3", sample_rate: "44100", channels: 2 },
      { codec_type: "video", codec_name: "mjpeg", disposition: { attached_pic: 1 } },
    ],
  }));
  assert.equal(probe.hasAudio, true);
  assert.equal(probe.hasCover, true);
  assert.equal(probe.duration, 213.2);
  assert.equal(probe.tags?.title, "Lose Yourself");
  assert.equal(probe.tags?.artist, "Eminem");

  const noAudio = parseFfprobeOutput(JSON.stringify({ format: {}, streams: [{ codec_type: "video" }] }));
  assert.equal(noAudio.hasAudio, false);
  assert.throws(() => parseFfprobeOutput("{"));
});

test("post-processing options clamp loudness target and default normalization off", () => {
  const defaults = resolvePostProcessingOptions(undefined);
  assert.equal(defaults.cleanMetadata, true);
  assert.equal(defaults.embedCover, true);
  assert.equal(defaults.normalizeLoudness, false);
  assert.deepEqual(defaults.loudnessTarget, { integrated: -14, truePeak: -1.5, lra: 11 });
  assert.equal(defaults.audioPolish.mode, "metadata-only");
  assert.equal(defaults.audioPolish.profile, "compatibility-mp3");
  assert.equal(defaults.audioPolish.exportComparisonReport, true);
  assert.deepEqual(resolvePostProcessingOptions({
    normalizeLoudness: true,
    loudnessTarget: { integrated: 0, truePeak: -9, lra: 99 },
  }).loudnessTarget, { integrated: -8, truePeak: -3, lra: 20 });
});

test("post-processing options reject custom filters and unknown modes", async () => {
  const { validatePostProcessingOptions } = await import("../lib/audioPostProcessor");
  assert.equal(validatePostProcessingOptions({ audioPolish: { mode: "bass-boost" } }).ok, false);
  assert.equal(validatePostProcessingOptions({ audioPolish: { profile: "force-audiophile" } }).ok, false);
  assert.equal(validatePostProcessingOptions({ audioPolish: { mode: "metadata-only", filter: "bass=g=6" } }).ok, false);
  assert.equal(validatePostProcessingOptions({ audioPolish: { profile: "phone-aac-preserve", ffmpegArgs: ["-af", "treble=g=6"] } }).ok, false);
  const safe = validatePostProcessingOptions({ audioPolish: { mode: "normalize-loudness" } });
  assert.equal(safe.ok, true);
  if (safe.ok) {
    assert.equal(safe.options.audioPolish.mode, "normalize-loudness");
    assert.equal(safe.options.audioPolish.profile, "mp3-normalized");
  }
});

test("phone profile codec decision matrix avoids unnecessary lossy conversions", () => {
  assert.deepEqual(planAudioExport({ profile: "phone-aac-preserve", sourceCodec: "aac" }), {
    profile: "phone-aac-preserve",
    outputContainer: "m4a",
    outputExtension: ".m4a",
    outputCodec: "aac",
    encoder: "copy",
    audioStreamCopied: true,
    reencoded: false,
    transcodeReason: "source AAC preserved for phone AAC profile",
    expectedContentType: "audio/mp4",
  });

  const mp3 = planAudioExport({ profile: "phone-aac-preserve", sourceCodec: "mp3" });
  assert.equal(mp3.outputExtension, ".mp3");
  assert.equal(mp3.encoder, "copy");
  assert.equal(mp3.reencoded, false);
  assert.match(mp3.transcodeReason, /avoid lossy MP3-to-AAC/);

  const opus = planAudioExport({ profile: "phone-aac-preserve", sourceCodec: "opus" });
  assert.equal(opus.outputExtension, ".m4a");
  assert.equal(opus.encoder, "aac");
  assert.equal(opus.reencoded, true);
  assert.match(opus.transcodeReason, /phone compatibility/);

  const normalized = planAudioExport({ profile: "phone-aac-normalized", sourceCodec: "aac" });
  assert.equal(normalized.outputExtension, ".m4a");
  assert.equal(normalized.encoder, "aac");
  assert.equal(normalized.reencoded, true);

  const compatible = planAudioExport({ profile: "compatibility-mp3", sourceCodec: "mp3" });
  assert.equal(compatible.outputExtension, ".mp3");
  assert.equal(compatible.encoder, "copy");
  assert.equal(compatible.reencoded, false);
});

test("m4a command builder uses MP4 metadata, AAC encoder, and no EQ filters", () => {
  const args = buildPostProcessArgs({
    inputPath: "C:\\tmp path\\input.webm",
    outputPath: "C:\\tmp path\\output.m4a",
    metadata,
    coverPath: "C:\\tmp path\\cover.jpg",
    outputContainer: "m4a",
    audioEncoder: "aac",
  });
  assert.ok(args.includes("-f"));
  assert.ok(args.includes("mp4"));
  assert.ok(args.includes("-c:a"));
  assert.ok(args.includes("aac"));
  assert.ok(args.includes("-b:a"));
  assert.ok(args.includes("256k"));
  assert.equal(args.includes("-id3v2_version"), false);
  assert.ok(args.includes("attached_pic"));
  assert.doesNotMatch(args.join(" "), /\b(?:bass|treble|equalizer|firequalizer|superequalizer|anequalizer)=/i);
});

test("postProcessAudio falls back to original bytes when ffmpeg fails", async () => {
  const tempDir = await fs.mkdtemp(path.join(tmpdir(), "ponotai-postprocess-test-"));
  const inputPath = path.join(tempDir, "input.mp3");
  const original = new Uint8Array([0x49, 0x44, 0x33, 0x04]);
  await fs.writeFile(inputPath, original);
  const runner: ProcessRunner = async () => ({ code: 1, stdout: "", stderr: "ffmpeg failed token=secret-value" });
  try {
    const result = await postProcessAudio({
      inputPath,
      tempDir,
      metadata,
      options: resolvePostProcessingOptions({}),
      originalBytes: original,
      runner,
      ffmpegPath: "ffmpeg",
      ffprobePath: "ffprobe",
      assumeMp3Input: true,
    });
    assert.equal(result.status, "failed-fallback-original");
    assert.deepEqual(Array.from(result.outputBytes), Array.from(original));
    assert.match(result.warnings.join(" "), /metadata-processing-failed/);
    assert.equal(result.audioPolish.mode, "metadata-only");
    assert.ok(result.audioPolish.warnings.includes("audio-polish-fallback-original"));
    assert.doesNotMatch(result.warnings.join(" "), /secret-value/);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("builders expose ffprobe and loudness analysis commands", () => {
  assert.deepEqual(buildFfprobeArgs("out.mp3").slice(0, 4), ["-v", "error", "-print_format", "json"]);
  assert.ok(buildLoudnessAnalysisArgs("in.mp3", { integrated: -14, truePeak: -1.5, lra: 11 }).join(" ").includes("print_format=json"));
});
