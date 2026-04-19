import { ErrorCatalog, sendError } from "../errors/errorCatalog";
import type { Response } from "express";

const ALLOWED_AUDIO_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "audio/ogg",
  "audio/flac",
  "audio/mp4",
  "audio/aac",
]);

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/bmp",
  "image/tiff",
]);

const ALLOWED_VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/mpeg",
]);

function hasSignaturePrefix(buffer: Buffer, prefixes: number[][]): boolean {
  return prefixes.some((prefix) => prefix.every((byte, index) => buffer[index] === byte));
}

function hasAudioSignature(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;
  return (
    hasSignaturePrefix(buffer, [[0x49, 0x44, 0x33], [0xFF, 0xFB], [0xFF, 0xF3], [0xFF, 0xF2], [0x66, 0x4C, 0x61, 0x43], [0x4F, 0x67, 0x67, 0x53]])
    || (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 && buffer[8] === 0x57 && buffer[9] === 0x41 && buffer[10] === 0x56 && buffer[11] === 0x45)
    || (buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70)
  );
}

function hasImageSignature(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;
  return hasSignaturePrefix(buffer, [
    [0xFF, 0xD8, 0xFF],
    [0x89, 0x50, 0x4E, 0x47],
    [0x47, 0x49, 0x46, 0x38],
    [0x42, 0x4D],
    [0x49, 0x49, 0x2A, 0x00],
    [0x4D, 0x4D, 0x00, 0x2A],
  ]) || (buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50);
}

function hasVideoSignature(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;
  return (
    (buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70)
    || (buffer[0] === 0x1A && buffer[1] === 0x45 && buffer[2] === 0xDF && buffer[3] === 0xA3)
  );
}

function reject(res: Response, message: string): false {
  sendError(res, ErrorCatalog.INVALID_PAYLOAD, { message });
  return false;
}

export function validateAudioUpload(file: Express.Multer.File | undefined, res: Response): boolean {
  if (!file || !file.buffer?.length) return reject(res, "Audio upload must include a non-empty file.");
  if (!ALLOWED_AUDIO_MIME_TYPES.has(file.mimetype)) return reject(res, "Audio file type is not allowed.");
  if (!hasAudioSignature(file.buffer)) return reject(res, "Audio file content is invalid or unsupported.");
  return true;
}

export function validateImageUpload(file: Express.Multer.File | undefined, res: Response): boolean {
  if (!file || !file.buffer?.length) return reject(res, "Image upload must include a non-empty file.");
  if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) return reject(res, "Image file type is not allowed.");
  if (!hasImageSignature(file.buffer)) return reject(res, "Image file content is invalid or unsupported.");
  return true;
}

export function validateVideoUpload(file: Express.Multer.File | undefined, res: Response): boolean {
  if (!file || !file.buffer?.length) return reject(res, "Video upload must include a non-empty file.");
  if (!ALLOWED_VIDEO_MIME_TYPES.has(file.mimetype)) return reject(res, "Video file type is not allowed.");
  if (!hasVideoSignature(file.buffer)) return reject(res, "Video file content is invalid or unsupported.");
  return true;
}
