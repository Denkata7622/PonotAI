import { Router } from "express";
import { getGlobalStats } from "../stats/stats.service";
import { getPersistenceHealth } from "../../db/persistence";
import { createUser, findUserByEmail, getAdminOverviewSnapshot, listApiKeysByUser, updateUser } from "../../db/authStore";
import { requireAuth } from "../../middlewares/auth.middleware";
import { signAuthToken } from "../../middlewares/auth.middleware";
import { requireAdmin } from "../../middlewares/admin.middleware";
import { adminRateLimit } from "../../middlewares/rateLimit.middleware";
import crypto from "node:crypto";
import { hashPassword } from "../auth/password";
import {
  DemoDatasetUnavailableError,
  generateDemoAccount,
  listDemoPersonas,
  type DemoGenerationOptions,
  type DemoPersona,
} from "../demo/demo.service";

const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);
adminRouter.use(adminRateLimit);
adminRouter.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

function daysAgoIso(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString();
}

function toUserPayload(user: { id: string; username: string; email: string; createdAt: string; role?: "user" | "admin"; isDemo?: boolean }) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    createdAt: user.createdAt,
    role: user.role ?? "user",
    isDemo: Boolean(user.isDemo),
    avatarBase64: null,
    bio: null,
  };
}

adminRouter.get("/overview", async (_req, res) => {
  const [stats, snapshot] = await Promise.all([getGlobalStats(), getAdminOverviewSnapshot()]);
  const recentUsers = [...snapshot.users].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 12);
  const recentPlaylists = [...snapshot.playlists].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 10);
  const recentRecognitions = [...snapshot.searchHistory].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20);
  const recentShares = [
    ...snapshot.sharedSongs.map((item) => ({ id: item.id, type: "song" as const, createdAt: item.createdAt, userId: item.userId })),
    ...snapshot.sharedPlaylists.map((item) => ({ id: item.id, type: "playlist" as const, createdAt: item.createdAt, userId: item.userId })),
    ...snapshot.sharedRecognitions.map((item) => ({ id: item.id, type: "recognition" as const, createdAt: item.createdAt, userId: item.userId })),
  ]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 20);
  const recentApiKeys = [...snapshot.apiKeys].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 10);

  const nowMinus7d = daysAgoIso(7);
  const nowMinus30d = daysAgoIso(30);
  const recentDemoUsers = [...snapshot.users]
    .filter((user) => user.isDemo)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 10)
    .map((user) => ({
      id: user.id,
      username: user.username,
      email: user.email,
      createdAt: user.createdAt,
      seededHistory: snapshot.searchHistory.filter((entry) => entry.userId === user.id).length,
      seededFavorites: snapshot.favorites.filter((entry) => entry.userId === user.id).length,
      seededPlaylists: snapshot.playlists.filter((playlist) => playlist.userId === user.id).length,
    }));
  const assistantRequests = snapshot.searchHistory.filter((item) => item.method === "assistant").length;
  const recentAiFailures = snapshot.searchHistory.filter((item) => !item.recognized && item.createdAt >= nowMinus7d).length;
  const recognizedCount = snapshot.searchHistory.filter((item) => item.recognized).length;
  const failedRecognitions = snapshot.searchHistory.length - recognizedCount;

  const recognitionMethodBreakdown = snapshot.searchHistory.reduce<Record<string, number>>((acc, row) => {
    acc[row.method] = (acc[row.method] ?? 0) + 1;
    return acc;
  }, {});

  const providerStatus = {
    assistantGemini: Boolean(process.env.GEMINI_API_KEY?.trim()),
    audd: Boolean((process.env.AUDD_API_TOKEN || process.env.AUDD_API_KEY || "").trim()),
    acrcloud: Boolean(process.env.ACRCLOUD_ACCESS_KEY?.trim() && process.env.ACRCLOUD_ACCESS_SECRET?.trim() && process.env.ACRCLOUD_HOST?.trim()),
    youtube: Boolean(process.env.YOUTUBE_API_KEY?.trim()),
    shazamMock: Boolean(process.env.SHAZAM_MOCK_RESPONSE?.trim()),
  };

  const persistence = getPersistenceHealth();
  const subsystemHealth = {
    persistence: {
      status: persistence.connected ? "ok" : "degraded",
      mode: persistence.mode,
      ...(persistence.lastError ? { message: persistence.lastError } : {}),
    },
    aiAssistant: {
      status: providerStatus.assistantGemini ? "ok" : "degraded",
      mode: providerStatus.assistantGemini ? "gemini" : "fallback",
    },
    recognitionProviders: {
      status: providerStatus.audd || providerStatus.acrcloud ? "ok" : "degraded",
      availableCount: Object.values(providerStatus).filter(Boolean).length,
      providers: providerStatus,
    },
  } as const;

  const demoPersonaDistribution = listDemoPersonas().map((persona) => ({
    key: persona.key,
    usernamePrefix: persona.usernamePrefix,
    count: snapshot.users.filter((user) => Boolean(user.isDemo) && user.username.startsWith(persona.usernamePrefix)).length,
  }));

  const usersCreated7d = snapshot.users.filter((item) => item.createdAt >= nowMinus7d).length;
  const usersCreated30d = snapshot.users.filter((item) => item.createdAt >= nowMinus30d).length;
  const recognitionLast7d = snapshot.searchHistory.filter((item) => item.createdAt >= nowMinus7d).length;
  const recognitionLast30d = snapshot.searchHistory.filter((item) => item.createdAt >= nowMinus30d).length;
  const sharesLast7d = recentShares.filter((item) => item.createdAt >= nowMinus7d).length;

  const activeApiKeys = snapshot.apiKeys.filter((key) => !key.revokedAt).length;
  const revokedApiKeys = snapshot.apiKeys.length - activeApiKeys;
  const usedApiKeys7d = snapshot.apiKeys.filter((key) => key.lastUsedAt && key.lastUsedAt >= nowMinus7d).length;

  const playlistSongCount = snapshot.playlists.reduce((sum, playlist) => sum + playlist.songs.length, 0);

  res.status(200).json({
    totals: {
      users: snapshot.totals.users,
      playlists: snapshot.totals.playlists,
      favorites: snapshot.totals.favorites,
      shares: snapshot.totals.sharesTotal,
      recognitions: snapshot.totals.recognitions,
      historyEntries: snapshot.totals.historyEntries,
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
      roleBreakdown: {
        admins: snapshot.users.filter((user) => user.role === "admin").length,
        users: snapshot.users.filter((user) => user.role !== "admin").length,
      },
      signups: {
        last7d: usersCreated7d,
        last30d: usersCreated30d,
      },
      activeUsers: {
        recognizedLast7d: new Set(snapshot.searchHistory.filter((item) => item.createdAt >= nowMinus7d).map((item) => item.userId)).size,
        recognizedLast30d: new Set(snapshot.searchHistory.filter((item) => item.createdAt >= nowMinus30d).map((item) => item.userId)).size,
      },
    },
    activity: {
      recentSignups: recentUsers.map((user) => ({
        id: user.id,
        username: user.username,
        role: user.role ?? "user",
        createdAt: user.createdAt,
      })),
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
    recognitions: {
      totals: {
        recorded: snapshot.searchHistory.length,
        recognized: recognizedCount,
        failed: failedRecognitions,
      },
      recent: {
        last7d: recognitionLast7d,
        last30d: recognitionLast30d,
      },
      methodBreakdown: recognitionMethodBreakdown,
    },
    shares: {
      counts: {
        songs: snapshot.totals.sharedSongs,
        playlists: snapshot.totals.sharedPlaylists,
        recognitions: snapshot.totals.sharedRecognitions,
      },
      recentCount7d: sharesLast7d,
      recent: recentShares,
    },
    library: {
      favoritesTotal: snapshot.favorites.length,
      playlistSongCount,
      averages: {
        favoritesPerUser: snapshot.users.length > 0 ? Number((snapshot.favorites.length / snapshot.users.length).toFixed(2)) : 0,
        playlistsPerUser: snapshot.users.length > 0 ? Number((snapshot.playlists.length / snapshot.users.length).toFixed(2)) : 0,
      },
    },
    developerApi: {
      totalKeys: snapshot.totals.apiKeys,
      activeKeys: activeApiKeys,
      revokedKeys: revokedApiKeys,
      usedLast7d: usedApiKeys7d,
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
      recentFailures: recentAiFailures,
      assistantRequests,
    },
    providerAvailability: providerStatus,
    demos: {
      recentProfiles: recentDemoUsers,
      personaDistribution: demoPersonaDistribution,
    },
    health: subsystemHealth,
    global: stats,
  });
});

adminRouter.get("/demo-personas", (_req, res) => {
  res.status(200).json({ items: listDemoPersonas() });
});

adminRouter.get("/developer-keys/:userId", async (req, res) => {
  const userId = req.params.userId?.trim();
  if (!userId || userId.length < 8 || userId.length > 80) {
    return res.status(400).json({ code: "INVALID_USER_ID", message: "Invalid user id." });
  }
  const keys = await listApiKeysByUser(userId);
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

adminRouter.get("/ai-observability", async (_req, res) => {
  const snapshot = await getAdminOverviewSnapshot();
  const nowMinus7d = daysAgoIso(7);
  const assistantEvents = snapshot.searchHistory.filter((item) => item.method === "assistant");
  const assistantEvents7d = assistantEvents.filter((item) => item.createdAt >= nowMinus7d);
  const failedAssistantEvents7d = assistantEvents7d.filter((item) => !item.recognized).length;
  const themeActionSignals7d = snapshot.searchHistory.filter((item) => item.method === "assistant-theme" && item.createdAt >= nowMinus7d).length;

  res.status(200).json({
    generatedAt: new Date().toISOString(),
    assistant: {
      available: Boolean(process.env.GEMINI_API_KEY?.trim()),
      mode: process.env.GEMINI_API_KEY?.trim() ? "gemini" : "fallback",
      requestsTotal: assistantEvents.length,
      requestsLast7d: assistantEvents7d.length,
      failuresLast7d: failedAssistantEvents7d,
    },
    providerStatus: {
      gemini: Boolean(process.env.GEMINI_API_KEY?.trim()),
      audd: Boolean((process.env.AUDD_API_TOKEN || process.env.AUDD_API_KEY || "").trim()),
      acrcloud: Boolean(process.env.ACRCLOUD_ACCESS_KEY?.trim() && process.env.ACRCLOUD_ACCESS_SECRET?.trim() && process.env.ACRCLOUD_HOST?.trim()),
    },
    recommendationSignals: {
      recognitionEventsLast7d: snapshot.searchHistory.filter((item) => item.createdAt >= nowMinus7d).length,
      uniqueArtistsLast7d: new Set(snapshot.searchHistory.filter((item) => item.createdAt >= nowMinus7d).map((item) => item.artist?.toLowerCase().trim()).filter(Boolean)).size,
      themeActionSignalsLast7d: themeActionSignals7d,
    },
    notes: {
      themeActionTracking: themeActionSignals7d === 0 ? "No explicit assistant-theme telemetry found in last 7 days." : "Theme assistant actions detected.",
    },
  });
});

adminRouter.post("/demo-account", async (req, res) => {
  try {
    const persona = req.body?.persona as DemoPersona | undefined;
    const options = req.body?.options as DemoGenerationOptions | undefined;
    const requiresConfirmation = req.body?.confirmGeneration === true;
    if (!requiresConfirmation) {
      return res.status(400).json({ code: "CONFIRMATION_REQUIRED", message: "Demo generation requires explicit confirmation." });
    }
    const allowedPersonas = new Set(listDemoPersonas().map((item) => item.key));
    if (persona && !allowedPersonas.has(persona)) {
      return res.status(400).json({ code: "INVALID_PERSONA", message: "Unknown demo persona." });
    }
    const created = await generateDemoAccount(persona ?? "gym", options);
    res.status(201).json(created);
  } catch (error) {
    if (error instanceof DemoDatasetUnavailableError) {
      console.warn("[admin] Demo account generation failed due to missing demo dataset.", {
        checkedPaths: error.checkedPaths,
      });
      return res.status(503).json({
        code: error.code,
        message: error.message,
      });
    }
    console.error("[admin] Demo account generation failed unexpectedly.", error);
    return res.status(500).json({
      code: "INTERNAL_ERROR",
      message: "Could not generate demo account.",
    });
  }
});

adminRouter.post("/demo-login", async (req, res) => {
  const configuredEmail = (process.env.ADMIN_DEMO_EMAIL ?? "admin-demo@demo.trackly.local").trim().toLowerCase();
  if (!configuredEmail.includes("@")) {
    return res.status(503).json({ code: "ADMIN_DEMO_NOT_CONFIGURED", message: "Admin demo login is not configured." });
  }
  const username = (process.env.ADMIN_DEMO_USERNAME ?? "AdminDemo").trim().slice(0, 30) || "AdminDemo";
  const temporaryPassword = `admin-demo-${crypto.randomBytes(8).toString("hex")}!`;
  try {
    const existing = await findUserByEmail(configuredEmail);
    const account = existing
      ? await updateUser(existing.id, {
        role: "admin",
        isDemo: true,
        passwordHash: hashPassword(temporaryPassword),
      }) ?? existing
      : await createUser({
        username,
        email: configuredEmail,
        role: "admin",
        isDemo: true,
        passwordHash: hashPassword(temporaryPassword),
      });

    const token = signAuthToken(account.id, "admin");
    res.status(200).json({
      token,
      user: toUserPayload(account),
      mode: "admin_demo_session",
    });
  } catch (error) {
    console.error("[admin] failed to bootstrap admin demo login", error);
    res.status(500).json({ code: "INTERNAL_ERROR", message: "Could not start admin demo session." });
  }
});

export default adminRouter;
