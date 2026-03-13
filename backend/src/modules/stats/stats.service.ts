import { listUsers, listUserHistory } from "../../db/authStore";
import { readHistory } from "../../db/client";

export type GlobalStats = {
  totalRecognitions: number;
  totalUsers: number;
  topArtists: Array<{ name: string; count: number }>;
};

export async function getGlobalStats(): Promise<GlobalStats> {
  const [users, publicHistory] = await Promise.all([listUsers(), readHistory()]);
  const artistCounts = new Map<string, number>();

  for (const item of publicHistory) {
    if (!item.artist) continue;
    artistCounts.set(item.artist, (artistCounts.get(item.artist) ?? 0) + 1);
  }

  for (const user of users) {
    const history = await listUserHistory(user.id);
    for (const item of history) {
      if (!item.recognized || !item.artist) continue;
      artistCounts.set(item.artist, (artistCounts.get(item.artist) ?? 0) + 1);
    }
  }

  const topArtists = [...artistCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  return {
    totalRecognitions: publicHistory.length,
    totalUsers: users.length,
    topArtists,
  };
}
