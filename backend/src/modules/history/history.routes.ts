import { Router } from "express";
import {
  clearHistoryController,
  createHistoryEntryController,
  deleteHistoryItemController,
  getHistoryController,
} from "./history.controller";
import { attachUserIfPresent, requireAuth } from "../../middlewares/auth.middleware";
import { asyncHandler } from "../../utils/asyncHandler";

const historyRouter = Router();

// GET: guests receive flat history.json entries; authenticated users receive their personal history.
// Changed from requireAuth → attachUserIfPresent so the frontend can always fetch history.
historyRouter.get("/", attachUserIfPresent, asyncHandler(getHistoryController));
historyRouter.post("/", requireAuth, asyncHandler(createHistoryEntryController));
historyRouter.delete("/:id", requireAuth, asyncHandler(deleteHistoryItemController));
historyRouter.delete("/", requireAuth, asyncHandler(clearHistoryController));

export default historyRouter;
