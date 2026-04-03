import type { Request, Response } from "express";
import { getGlobalStats } from "./stats.service";

/** Returns aggregated platform statistics with a safe empty fallback on read failure. */
export async function getGlobalStatsController(_req: Request, res: Response): Promise<void> {
  try {
    const stats = await getGlobalStats();
    res.json(stats);
  } catch {
    res.status(200).json({
      totalRecognitions: 0,
      totalUsers: 0,
      topArtists: [],
    });
  }
}
