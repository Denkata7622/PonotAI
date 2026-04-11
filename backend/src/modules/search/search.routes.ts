import { Router } from "express";
import { attachUserIfPresent } from "../../middlewares/auth.middleware";
import { getUserPlaylists, listFavorites, listUserHistory } from "../../db/authStore";

const searchRouter = Router();

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

function scoreMatch(query: string, candidate: string): number {
  if (!query || !candidate) return 0;
  const q = query.toLowerCase();
  const c = candidate.toLowerCase();
  if (c.includes(q)) return 1;
  const distance = levenshtein(q, c.slice(0, Math.max(q.length, 2 * q.length)));
  return Math.max(0, 1 - distance / Math.max(q.length, c.length, 1));
}

searchRouter.get("/fuzzy", attachUserIfPresent, async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 80) : "";
  if (!req.userId || !q) return res.status(200).json({ items: [] });

  const [history, favorites, playlists] = await Promise.all([
    listUserHistory(req.userId),
    listFavorites(req.userId),
    getUserPlaylists(req.userId),
  ]);

  const candidates = [
    ...history.map((entry) => ({ type: "history", title: entry.title ?? "", artist: entry.artist ?? "", id: entry.id })),
    ...favorites.map((entry) => ({ type: "favorite", title: entry.title, artist: entry.artist, id: entry.id })),
    ...playlists.map((entry) => ({ type: "playlist", title: entry.name, artist: "", id: entry.id })),
  ];

  const items = candidates
    .map((entry) => ({ ...entry, score: Math.max(scoreMatch(q, entry.title), scoreMatch(q, `${entry.title} ${entry.artist}`)) }))
    .filter((entry) => entry.score >= 0.35)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);

  res.status(200).json({ items });
});

export default searchRouter;
