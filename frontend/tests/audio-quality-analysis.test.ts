import test from "node:test";
import assert from "node:assert/strict";
import {
  compareAudioAnalysis,
  buildQualityPreservation,
  parseFfprobeAnalysis,
  parseLoudnormAnalysis,
  parseSilencedetectOutput,
  parseVolumedetectOutput,
  type AudioAnalysis,
} from "../lib/audioQualityAnalysis";
import { DEFAULT_AUDIO_POLISH_OPTIONS } from "../lib/audioPolishTypes";

const normalizeOptions = {
  ...DEFAULT_AUDIO_POLISH_OPTIONS,
  mode: "normalize-loudness" as const,
  normalizeLoudness: true,
};

function analysis(input: Partial<AudioAnalysis>): AudioAnalysis {
  return { hasAudio: true, codecName: "mp3", durationSec: 180, sampleRate: 44100, channels: 2, warnings: [], ...input };
}

test("audio analysis parsers handle loudnorm, volume, silence, and ffprobe output", () => {
  const loudness = parseLoudnormAnalysis(`noise\n{
    "input_i": "-8.20",
    "input_tp": "-0.12",
    "input_lra": "4.30",
    "input_thresh": "-18.40"
  }\n`);
  assert.equal(loudness?.integratedLufs, -8.2);
  assert.equal(loudness?.truePeakDb, -0.12);
  assert.equal(loudness?.loudnessRangeLra, 4.3);

  const peaks = parseVolumedetectOutput("[Parsed_volumedetect] mean_volume: -17.8 dB\n[Parsed_volumedetect] max_volume: -0.2 dB");
  assert.equal(peaks?.meanVolumeDb, -17.8);
  assert.equal(peaks?.maxVolumeDb, -0.2);

  const silence = parseSilencedetectOutput("silence_start: 0\nsilence_end: 0.52 | silence_duration: 0.52\nsilence_start: 9.1\n", 10);
  assert.equal(silence?.detected, true);
  assert.equal(silence?.leadingSilenceSec, 0.52);
  assert.equal(silence?.trailingSilenceSec, 0.9);

  const probe = parseFfprobeAnalysis(JSON.stringify({
    format: { duration: "10.2", bit_rate: "192000", format_name: "mp3" },
    streams: [{ codec_type: "audio", codec_name: "mp3", sample_rate: "44100", channels: 2 }],
  }), 1024);
  assert.equal(probe.hasAudio, true);
  assert.equal(probe.durationSec, 10.2);
  assert.equal(probe.codecName, "mp3");
  assert.equal(probe.fileSizeBytes, 1024);

  assert.equal(parseFfprobeAnalysis("{").hasAudio, false);
});

test("comparison scoring marks loudness normalization as technically improved", () => {
  const before = analysis({ loudness: { integratedLufs: -8, truePeakDb: -0.1, loudnessRangeLra: 5 }, peaks: { maxVolumeDb: -0.1 } });
  const after = analysis({ loudness: { integratedLufs: -14.1, truePeakDb: -1.6, loudnessRangeLra: 6 }, peaks: { maxVolumeDb: -1.1 } });
  const comparison = compareAudioAnalysis(before, after, normalizeOptions);

  assert.equal(comparison.verdict, "improved");
  assert.ok(comparison.score.volumeConsistency > 80);
  assert.match(comparison.reasons.join(" "), /closer to -14 LUFS/);
});

test("comparison scoring stays neutral when metadata-only preserves audio", () => {
  const before = analysis({ loudness: { integratedLufs: -14, truePeakDb: -1.2, loudnessRangeLra: 7 } });
  const after = analysis({ loudness: { integratedLufs: -14, truePeakDb: -1.2, loudnessRangeLra: 7 } });
  const comparison = compareAudioAnalysis(before, after, DEFAULT_AUDIO_POLISH_OPTIONS);

  assert.equal(comparison.verdict, "neutral");
  assert.ok(comparison.score.preservation >= 90);
});

test("comparison scoring flags severe duration loss and missing audio as worse", () => {
  const before = analysis({ durationSec: 200, loudness: { integratedLufs: -9, truePeakDb: -0.2 } });
  const durationLoss = analysis({ durationSec: 120, loudness: { integratedLufs: -14, truePeakDb: -1.5 } });
  const missingAudio = analysis({ hasAudio: false, codecName: undefined, warnings: ["audio-codec-missing"] });

  assert.equal(compareAudioAnalysis(before, durationLoss, normalizeOptions).verdict, "worse");
  const missing = compareAudioAnalysis(before, missingAudio, normalizeOptions);
  assert.equal(missing.verdict, "worse");
  assert.ok(missing.warnings.includes("audio-codec-missing"));
});

test("comparison scoring penalizes clipping risk", () => {
  const before = analysis({ loudness: { integratedLufs: -8, truePeakDb: -0.1 } });
  const after = analysis({ loudness: { integratedLufs: -14, truePeakDb: -0.2 }, peaks: { maxVolumeDb: 0 } });
  const comparison = compareAudioAnalysis(before, after, normalizeOptions);

  assert.ok(comparison.score.clippingSafety < 80);
  assert.ok(comparison.warnings.includes("clipping-risk-detected"));
});

test("phone profile scoring rewards preserved AAC without re-encoding", () => {
  const quality = buildQualityPreservation({
    profile: "phone-aac-preserve",
    before: analysis({ codecName: "aac", formatName: "mov,mp4,m4a,3gp,3g2,mj2" }),
    after: analysis({ codecName: "aac", formatName: "mov,mp4,m4a,3gp,3g2,mj2" }),
    outputExtension: ".m4a",
    outputCodec: "aac",
    outputContainer: "m4a",
    audioStreamCopied: true,
    reencoded: false,
    transcodeReason: "source AAC preserved for phone AAC profile",
    coverEmbedded: true,
    coverExpected: true,
  });

  assert.equal(quality.verdict, "preserved-best");
  assert.equal(quality.audioStreamCopied, true);
  assert.equal(quality.reencoded, false);
  assert.equal(quality.generationLossRisk, "none");
  assert.equal(quality.samsungMusicFriendly, true);
  assert.ok(quality.phoneProfileScore >= 90);
});

test("phone profile scoring keeps MP3 instead of forcing AAC", () => {
  const quality = buildQualityPreservation({
    profile: "phone-aac-preserve",
    before: analysis({ codecName: "mp3", formatName: "mp3" }),
    after: analysis({ codecName: "mp3", formatName: "mp3" }),
    outputExtension: ".mp3",
    outputCodec: "mp3",
    outputContainer: "mp3",
    audioStreamCopied: true,
    reencoded: false,
    transcodeReason: "source MP3 preserved to avoid lossy MP3-to-AAC transcode",
  });

  assert.equal(quality.verdict, "preserved-best");
  assert.equal(quality.lossyToLossyTranscode, false);
  assert.equal(quality.bluetoothFriendly, true);
});

test("phone profile scoring records compatible Opus to AAC transcode", () => {
  const quality = buildQualityPreservation({
    profile: "phone-aac-preserve",
    before: analysis({ codecName: "opus", formatName: "matroska,webm" }),
    after: analysis({ codecName: "aac", formatName: "mov,mp4,m4a,3gp,3g2,mj2" }),
    outputExtension: ".m4a",
    outputCodec: "aac",
    outputContainer: "m4a",
    audioStreamCopied: false,
    reencoded: true,
    transcodeReason: "converted Opus/Vorbis source to AAC for Samsung Music phone compatibility",
  });

  assert.equal(quality.verdict, "compatible-transcode");
  assert.equal(quality.reencoded, true);
  assert.equal(quality.lossyToLossyTranscode, true);
  assert.equal(quality.generationLossRisk, "medium");
});
