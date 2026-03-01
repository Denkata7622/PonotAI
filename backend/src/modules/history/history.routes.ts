import { Router } from "express";
import {
  clearHistoryController,
  createHistoryEntryController,
  deleteHistoryItemController,
  getHistoryController,
} from "./history.controller";
import { attachUserIfPresent, requireAuth } from "../../middlewares/auth.middleware";

const historyRouter = Router();

// GET: guests receive flat history.json entries; authenticated users receive their personal history.
// Changed from requireAuth → attachUserIfPresent so the frontend can always fetch history.
historyRouter.get("/", attachUserIfPresent, getHistoryController);
historyRouter.post("/", attachUserIfPresent, createHistoryEntryController);
historyRouter.delete("/:id", requireAuth, deleteHistoryItemController);
historyRouter.delete("/", requireAuth, clearHistoryController);

export default historyRouter;
