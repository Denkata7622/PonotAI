import assert from "node:assert/strict";
import test from "node:test";
import { binaryFromLocation, clampTimeout, looksOldYtDlp, safeBinaryName } from "../lib/downloadDiagnostics";
import { GET } from "../app/api/download/diagnostics/route";

test("download diagnostics returns frontend runtime shape without secrets", async () => {
  const response = await GET(new Request("http://test.local/api/download/diagnostics"));
  const body = await response.json() as {
    mode: string;
    platform: string;
    nodeVersion: string;
    runningInFrontendService: boolean;
    downloader: { binary: string; found: boolean; looksStale: boolean };
    ffmpeg: { found: boolean };
    ffprobe: { found: boolean };
    cache: { dir: string; writable: boolean };
    temp: { dir: string; writable: boolean };
    config: { envFlagsPresent: Record<string, boolean> };
    frontendVsBackend: { backendPythonPackagesMatter: boolean; frontendDockerfileMatters: boolean };
    audioAnalysisAvailable: boolean;
    supportedAudioPolishModes: string[];
    supportedAudioProfiles: string[];
    ffmpegEncoders?: { checked: boolean; aac: boolean; libmp3lame: boolean };
    fixes: string[];
  };

  assert.equal(response.status, 200);
  assert.ok(["local", "cloud", "unknown"].includes(body.mode));
  assert.equal(typeof body.platform, "string");
  assert.match(body.nodeVersion, /^v/);
  assert.equal(body.runningInFrontendService, true);
  assert.equal(body.frontendVsBackend.backendPythonPackagesMatter, false);
  assert.equal(body.frontendVsBackend.frontendDockerfileMatters, true);
  assert.equal(typeof body.audioAnalysisAvailable, "boolean");
  assert.ok(body.supportedAudioPolishModes.includes("metadata-only"));
  assert.ok(body.supportedAudioPolishModes.includes("normalize-loudness-safe"));
  assert.ok(body.supportedAudioProfiles.includes("compatibility-mp3"));
  assert.ok(body.supportedAudioProfiles.includes("phone-aac-preserve"));
  assert.equal(typeof body.ffmpegEncoders?.checked, "boolean");
  assert.ok(Object.prototype.hasOwnProperty.call(body.config.envFlagsPresent, "YTDLP_PATH"));
  assert.ok(Object.prototype.hasOwnProperty.call(body.config.envFlagsPresent, "FFMPEG_LOCATION"));
  assert.doesNotMatch(JSON.stringify(body), /token|secret|password|cookie=/i);
});

test("download diagnostics helpers keep Windows paths client-safe", () => {
  const binary = "C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe";
  assert.equal(safeBinaryName(binary), "ffmpeg.exe");
  assert.match(binaryFromLocation("C:\\Program Files\\ffmpeg\\bin", "ffprobe", "win32"), /ffprobe\.exe$/);
});

test("download diagnostics detects stale yt-dlp and clamps timeout", () => {
  assert.equal(looksOldYtDlp("2020.01.01"), true);
  assert.equal(clampTimeout("1"), 30000);
  assert.equal(clampTimeout("9999999"), 600000);
});
