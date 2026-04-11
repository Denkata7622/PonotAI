import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware";
import { getUserAchievements, recalculateAchievementsForUser } from "./achievements.service";

const achievementsRouter = Router();

achievementsRouter.get("/", requireAuth, async (req, res) => {
  const userId = req.userId!;
  await recalculateAchievementsForUser(userId);
  const achievements = await getUserAchievements(userId);
  res.status(200).json({ items: achievements });
});

export default achievementsRouter;
