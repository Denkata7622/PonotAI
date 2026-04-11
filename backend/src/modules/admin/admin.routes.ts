import { Router } from "express";
import { getGlobalStats } from "../stats/stats.service";
import { getAdminOverviewSnapshot, listApiKeysByUser } from "../../db/authStore";
import { requireAuth } from "../../middlewares/auth.middleware";
import { requireAdmin } from "../../middlewares/admin.middleware";
import { generateDemoAccount, listDemoPersonas, type DemoPersona } from "../demo/demo.service";

const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);

adminRouter.get("/overview", async (_req, res) => {
  const [stats, snapshot] = await Promise.all([getGlobalStats(), getAdminOverviewSnapshot()]);
  const recentUsers = [...snapshot.users].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 10);
  const recentPlaylists = [...snapshot.playlists].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 10);
  const recentRecognitions = [...snapshot.searchHistory].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 12);
  const recentShares = [
    ...snapshot.sharedSongs.map((item) => ({ id: item.id, type: "song" as const, createdAt: item.createdAt, userId: item.userId })),
    ...snapshot.sharedPlaylists.map((item) => ({ id: item.id, type: "playlist" as const, createdAt: item.createdAt, userId: item.userId })),
    ...snapshot.sharedRecognitions.map((item) => ({ id: item.id, type: "recognition" as const, createdAt: item.createdAt, userId: item.userId })),
  ]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 12);
  const recentApiKeys = [...snapshot.apiKeys].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 10);

  res.status(200).json({
    totals: {
      users: snapshot.totals.users,
      playlists: snapshot.totals.playlists,
      shares: snapshot.totals.sharesTotal,
      recognitions: snapshot.totals.recognitions,
      demoAccounts: snapshot.totals.demoAccounts,
      achievementsAwarded: snapshot.totals.achievementsAwarded,
      apiKeys: snapshot.totals.apiKeys,
    },
    users: {
      recent: recentUsers.map((user) => ({
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role ?? "user",
        isDemo: Boolean(user.isDemo),
        createdAt: user.createdAt,
      })),
    },
    activity: {
      recentRecognitions: recentRecognitions.map((item) => ({
        id: item.id,
        userId: item.userId,
        title: item.title,
        artist: item.artist,
        method: item.method,
        recognized: item.recognized,
        createdAt: item.createdAt,
      })),
      recentPlaylists: recentPlaylists.map((item) => ({
        id: item.id,
        userId: item.userId,
        name: item.name,
        songCount: item.songs.length,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
    },
    shares: {
      counts: {
        songs: snapshot.totals.sharedSongs,
        playlists: snapshot.totals.sharedPlaylists,
        recognitions: snapshot.totals.sharedRecognitions,
      },
      recent: recentShares,
    },
    developerApi: {
      totalKeys: snapshot.totals.apiKeys,
      recentKeys: recentApiKeys.map((key) => ({
        id: key.id,
        userId: key.userId,
        label: key.label,
        keyPrefix: key.keyPrefix,
        createdAt: key.createdAt,
        lastUsedAt: key.lastUsedAt,
        revokedAt: key.revokedAt,
      })),
    },
    ai: {
      assistantAvailable: Boolean(process.env.GEMINI_API_KEY?.trim()),
      mode: process.env.GEMINI_API_KEY?.trim() ? "gemini" : "fallback",
      recentFailures: 0,
    },
    global: stats,
  });
});

adminRouter.get("/demo-personas", (_req, res) => {
  res.status(200).json({ items: listDemoPersonas() });
});

adminRouter.get("/developer-keys/:userId", async (req, res) => {
  const keys = await listApiKeysByUser(req.params.userId);
  res.status(200).json({
    items: keys.map((key) => ({
      id: key.id,
      label: key.label,
      keyPrefix: key.keyPrefix,
      createdAt: key.createdAt,
      lastUsedAt: key.lastUsedAt,
      revokedAt: key.revokedAt,
    })),
  });
});

adminRouter.post("/demo-account", async (req, res) => {
  const persona = req.body?.persona as DemoPersona | undefined;
  const created = await generateDemoAccount(persona ?? "gym");
  res.status(201).json(created);
});

export default adminRouter;
