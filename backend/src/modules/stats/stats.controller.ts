import type { Request, Response } from "express";
import { ErrorCatalog, sendError } from "../../errors/errorCatalog";
import { getGlobalStats } from "./stats.service";

/**
 * Returns aggregated platform statistics.
 * @route GET /api/stats/global
 * @auth No authentication required.
 * @example GET /api/stats/global
 * @param _req Express request (unused).
 * @param res Express response returning global usage statistics.
 * @returns Promise that resolves after sending an HTTP response.
 * @throws Re-throws unexpected aggregation failures.
 */
export async function getGlobalStatsController(_req: Request, res: Response): Promise<void> {
  try {
    const stats = await getGlobalStats();
    res.json(stats);
  } catch (error) {
    console.error("Global stats error:", error);
    sendError(res, ErrorCatalog.INTERNAL_ERROR);
  }
}
