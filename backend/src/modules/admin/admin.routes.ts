import { Router } from "express";
import { getGlobalStats } from "../stats/stats.service";
import { listApiKeysByUser, listSharedAssets, listUsers } from "../../db/authStore";
import { requireAuth } from "../../middlewares/auth.middleware";
import { requireAdmin } from "../../middlewares/admin.middleware";
import { generateDemoAccount, type DemoPersona } from "../demo/demo.service";

const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);

adminRouter.get("/overview", async (_req, res) => {
  const [users, stats, shared] = await Promise.all([listUsers(), getGlobalStats(), listSharedAssets(50)]);
  res.status(200).json({
    users: users.map((user) => ({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role ?? "user",
      isDemo: Boolean(user.isDemo),
      createdAt: user.createdAt,
    })),
    shared,
    stats,
  });
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
