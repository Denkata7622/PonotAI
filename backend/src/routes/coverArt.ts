import { Router } from "express";
import { searchCoverArt, searchMoreCoverArt } from "../services/coverArt";

const coverArtRouter = Router();

coverArtRouter.get("/", async (req, res) => {
  const { title, artist, exclude } = req.query as Record<string, string>;
  if (!title || !artist) {
    return res.status(400).json({ code: "VALIDATION_ERROR", message: "title and artist required" });
  }

  try {
    const excludeUrls = exclude ? exclude.split(",").filter(Boolean) : [];
    const covers = excludeUrls.length > 0
      ? await searchMoreCoverArt(title, artist, excludeUrls)
      : await searchCoverArt(title, artist);
    return res.status(200).json({ covers });
  } catch {
    return res.status(500).json({ covers: [] });
  }
});

export default coverArtRouter;
