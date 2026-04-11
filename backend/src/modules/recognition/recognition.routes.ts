import { Router } from "express";
import { attachUserIfPresent } from "../../middlewares/auth.middleware";
import { audioUpload, imageUpload, videoUpload } from "../../middlewares/upload.middleware";
import { recognizeAudioController, recognizeImageController } from "./recognition.controller";

const recognitionRouter = Router();

recognitionRouter.use(attachUserIfPresent);
recognitionRouter.post("/audio", audioUpload.single("audio"), recognizeAudioController);
recognitionRouter.post("/audio/live", audioUpload.single("audio"), (req, _res, next) => {
  req.body = { ...(req.body || {}), mode: "live" };
  next();
}, recognizeAudioController);
recognitionRouter.post("/audio/humming", audioUpload.single("audio"), (req, _res, next) => {
  req.body = { ...(req.body || {}), mode: "humming" };
  next();
}, recognizeAudioController);
recognitionRouter.post("/video", videoUpload.single("video"), (req, _res, next) => {
  req.body = { ...(req.body || {}), mode: "video" };
  next();
}, recognizeAudioController);
recognitionRouter.post("/image", imageUpload.single("image"), recognizeImageController);

export default recognitionRouter;
