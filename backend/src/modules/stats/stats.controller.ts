import type { Request, Response } from "express";
import { ErrorCatalog, sendError } from "../../errors/errorCatalog";
import { getGlobalStats } from "./stats.service";

/** Returns aggregated platform statistics. */
export async function getGlobalStatsController(_req: Request, res: Response): Promise<void> {
  try {
    const stats = await getGlobalStats();
    res.json(stats);
  } catch (error) {
    console.error("Global stats error:", error);
    sendError(res, ErrorCatalog.INTERNAL_ERROR);
  }
}
