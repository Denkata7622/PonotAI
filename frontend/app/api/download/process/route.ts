import { promises as fs } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { NextResponse } from "next/server";
import { binaryFromLocation } from "@/lib/downloadDiagnostics";
import { encodePostProcessingHeader, postProcessAudio, validatePostProcessingOptions } from "@/lib/audioPostProcessor";
import { resolveTrackMetadata } from "@/lib/trackMetadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_AUDIO_BYTES = 150 * 1024 * 1024;

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function isMp3Like(file: File, contentType: string): boolean {
  const type = contentType.split(";")[0].trim().toLowerCase();
  return type === "audio/mpeg" || type === "audio/mp3" || file.name.toLowerCase().endsWith(".mp3");
}

function contentDisposition(filename: string): string {
  const asciiFallback = filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_") || "track.mp3";
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function jsonError(error: string, code: string, status: number, fix = "Export the original file or try again with ffmpeg/ffprobe available in the frontend service."): NextResponse {
  return NextResponse.json({ error, code, fix }, { status });
}

export async function POST(request: Request): Promise<Response> {
  let tempDir = "";
  try {
    const form = await request.formData();
    const audio = form.get("audio");
    if (!(audio instanceof File)) return jsonError("Audio file is required.", "missing-audio", 400);
    if (audio.size <= 0) return jsonError("Audio file is empty.", "empty-audio", 400);
    if (audio.size > MAX_AUDIO_BYTES) return jsonError("Audio file is too large for local post-processing.", "audio-too-large", 413);

    const metadataJson = String(form.get("metadata") || "{}");
    const optionsJson = String(form.get("postProcessing") || "{}");
    const metadataInput = JSON.parse(metadataJson) as unknown;
    const optionsInput = JSON.parse(optionsJson) as unknown;
    const metadata = resolveTrackMetadata(metadataInput && typeof metadataInput === "object" && !Array.isArray(metadataInput) ? metadataInput : {});
    const validatedOptions = validatePostProcessingOptions(optionsInput);
    if (!validatedOptions.ok) return jsonError(validatedOptions.message, validatedOptions.code, 400, validatedOptions.fix);
    const options = validatedOptions.options;
    const contentType = audio.type || "application/octet-stream";
    const bytes = new Uint8Array(await audio.arrayBuffer());

    tempDir = await fs.mkdtemp(path.join(tmpdir(), "ponotai-upload-postprocess-"));
    const inputPath = path.join(tempDir, isMp3Like(audio, contentType) ? "direct-input.mp3" : `direct-input${path.extname(audio.name) || ".audio"}`);
    await fs.writeFile(inputPath, bytes);

    const processed = await postProcessAudio({
      inputPath,
      tempDir,
      metadata,
      options,
      originalBytes: bytes,
      ffmpegPath: binaryFromLocation(process.env.FFMPEG_LOCATION, "ffmpeg"),
      ffprobePath: binaryFromLocation(process.env.FFMPEG_LOCATION, "ffprobe"),
      assumeMp3Input: isMp3Like(audio, contentType),
    });

    return new Response(bytesToArrayBuffer(processed.outputBytes), {
      status: 200,
      headers: {
        "Content-Type": processed.contentType === "application/octet-stream" ? contentType : processed.contentType,
        "Content-Length": String(processed.outputBytes.byteLength),
        "Content-Disposition": contentDisposition(processed.filename),
        "Cache-Control": "no-store",
        "X-PonotAI-Filename": encodeURIComponent(processed.filename),
        "X-PonotAI-Postprocessing": encodePostProcessingHeader(processed),
      },
    });
  } catch {
    return jsonError("Audio post-processing failed.", "metadata-processing-failed", 500);
  } finally {
    if (tempDir) await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
