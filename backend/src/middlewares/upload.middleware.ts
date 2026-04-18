import multer from "multer";

const memoryStorage = multer.memoryStorage();
const AUDIO_MIME_TYPES = new Set(["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/webm", "audio/ogg", "audio/flac", "audio/mp4", "audio/aac"]);
const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp", "image/tiff"]);
const VIDEO_MIME_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime", "video/mpeg"]);

const audioFileFilter = (_req: any, file: any, cb: any) => {
  if (AUDIO_MIME_TYPES.has(file.mimetype)) {
    cb(null, true);
    return;
  }
  cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", "audio"));
};

const imageFileFilter = (_req: any, file: any, cb: any) => {
  if (IMAGE_MIME_TYPES.has(file.mimetype)) {
    cb(null, true);
    return;
  }
  cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", "image"));
};

export const audioUpload = multer({
  storage: memoryStorage,
  limits: {
    fileSize: 15 * 1024 * 1024,
  },
  fileFilter: audioFileFilter,
});

export const videoUpload = multer({
  storage: memoryStorage,
  limits: {
    fileSize: 40 * 1024 * 1024,
  },
  fileFilter: (_req: any, file: any, cb: any) => {
    if (VIDEO_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", "video"));
  },
});

export const imageUpload = multer({
  storage: memoryStorage,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: imageFileFilter,
});
