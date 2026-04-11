import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware";
import { syncLibraryController, getLibraryController, getLibraryReportController } from "./library.controller";

const libraryRouter = Router();

libraryRouter.use(requireAuth);

libraryRouter.post("/sync", syncLibraryController);
libraryRouter.get("/", getLibraryController);
libraryRouter.get("/report", getLibraryReportController);

export default libraryRouter;
