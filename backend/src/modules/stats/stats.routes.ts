import { Router } from "express";
import { getGlobalStatsController } from "./stats.controller";

const router = Router();

router.get("/global", getGlobalStatsController);

export default router;
