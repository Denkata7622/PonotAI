import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware";
import { assistantRateLimit } from "../../middlewares/rateLimit.middleware";
import {
  applyTagsController,
  contextualRecommendationsController,
  dailyDiscoveryController,
  generatePlaylistController,
  getMonthlyInsightsController,
  getTrendsController,
  getWeeklyInsightsController,
  moodRecommendationsController,
  suggestTagsController,
  surpriseDiscoveryController,
  updatePlaylistController,
} from "./ai.controller";

const router = Router();

router.use(requireAuth);
router.use(assistantRateLimit);

router.get("/insights/weekly", getWeeklyInsightsController);
router.get("/insights/monthly", getMonthlyInsightsController);
router.get("/insights/trends", getTrendsController);

router.post("/playlists/generate", generatePlaylistController);
router.post("/playlists/update", updatePlaylistController);

router.get("/recommendations/mood", moodRecommendationsController);
router.get("/recommendations/contextual", contextualRecommendationsController);

router.post("/tags/suggest", suggestTagsController);
router.post("/tags/apply", applyTagsController);

router.get("/discovery/daily", dailyDiscoveryController);
router.get("/discovery/surprise", surpriseDiscoveryController);

export default router;
