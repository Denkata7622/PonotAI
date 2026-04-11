import { getUserPlaylists, listAchievements, listUserHistory, unlockAchievement } from "../../db/authStore";

export const ACHIEVEMENT_KEYS = {
  FIRST_RECOGNITION: "first_recognition",
  TEN_RECOGNITIONS: "ten_recognitions",
  FIRST_PLAYLIST: "first_playlist",
  PLAYLIST_CURATOR: "playlist_curator",
  NIGHT_OWL: "night_owl",
  WEEK_STREAK: "seven_day_streak",
} as const;

export async function recalculateAchievementsForUser(userId: string): Promise<void> {
  const [history, playlists] = await Promise.all([listUserHistory(userId), getUserPlaylists(userId)]);

  if (history.length >= 1) await unlockAchievement(userId, ACHIEVEMENT_KEYS.FIRST_RECOGNITION);
  if (history.length >= 10) await unlockAchievement(userId, ACHIEVEMENT_KEYS.TEN_RECOGNITIONS);

  if (playlists.length >= 1) await unlockAchievement(userId, ACHIEVEMENT_KEYS.FIRST_PLAYLIST);
  if (playlists.length >= 3) await unlockAchievement(userId, ACHIEVEMENT_KEYS.PLAYLIST_CURATOR);

  const hasNightOwl = history.some((item) => {
    const hour = new Date(item.createdAt).getHours();
    return hour >= 0 && hour <= 4;
  });
  if (hasNightOwl) await unlockAchievement(userId, ACHIEVEMENT_KEYS.NIGHT_OWL);

  const uniqueDays = new Set(history.map((item) => item.createdAt.slice(0, 10)));
  if (uniqueDays.size >= 7) {
    await unlockAchievement(userId, ACHIEVEMENT_KEYS.WEEK_STREAK, { distinctDays: uniqueDays.size });
  }
}

export async function getUserAchievements(userId: string) {
  return listAchievements(userId);
}
