import assert from "node:assert/strict";
import test from "node:test";
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
    fixes: string[];
  };

  assert.equal(response.status, 200);
  assert.ok(["local", "cloud", "unknown"].includes(body.mode));
  assert.equal(typeof body.platform, "string");
  assert.match(body.nodeVersion, /^v/);
  assert.equal(body.runningInFrontendService, true);
  assert.equal(body.frontendVsBackend.backendPythonPackagesMatter, false);
  assert.equal(body.frontendVsBackend.frontendDockerfileMatters, true);
  assert.ok(Object.prototype.hasOwnProperty.call(body.config.envFlagsPresent, "YTDLP_PATH"));
  assert.ok(Object.prototype.hasOwnProperty.call(body.config.envFlagsPresent, "FFMPEG_LOCATION"));
  assert.doesNotMatch(JSON.stringify(body), /token|secret|password|cookie=/i);
});
