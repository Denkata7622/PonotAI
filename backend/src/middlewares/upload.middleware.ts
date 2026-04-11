import multer from "multer";

const memoryStorage = multer.memoryStorage();

const audioFileFilter = (_req: any, file: any, cb: any) => {
  if (file.mimetype.startsWith("audio/")) {
    cb(null, true);
    return;
  }
  cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", "audio"));
};

const imageFileFilter = (_req: any, file: any, cb: any) => {
  if (file.mimetype.startsWith("image/")) {
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
    if (file.mimetype.startsWith("video/")) {
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
