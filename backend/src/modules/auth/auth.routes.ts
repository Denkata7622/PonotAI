import { Router } from "express";
import {
  createUser,
  deleteUserCascade,
  findUserByEmail,
  findUserById,
  findUserByUsername,
  type UserRecord,
  updateUser,
} from "../../db/authStore";
import { requireAuth, signAuthToken } from "../../middlewares/auth.middleware";
import { authSensitiveRateLimit } from "../../middlewares/rateLimit.middleware";
import { ErrorCatalog, sendError } from "../../errors/errorCatalog";
import { hashPassword, verifyPassword } from "./password";

const authRouter = Router();

const USERNAME_REGEX = /^\w{3,30}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ADMIN_ROLE = "admin" as const;
const USER_ROLE = "user" as const;

function getAdminEmailSet(): Set<string> {
  const configured = [
    process.env.ADMIN_EMAIL?.trim(),
    ...(process.env.ADMIN_EMAILS ?? "").split(","),
  ]
    .map((item) => item?.trim().toLowerCase())
    .filter((item): item is string => Boolean(item));

  return new Set(configured);
}

async function ensureAdminRoleForConfiguredEmail(
  user: UserRecord,
  reason: "register" | "login" | "auth_me",
): Promise<UserRecord> {
  const adminEmails = getAdminEmailSet();
  const isConfiguredAdmin = adminEmails.has(user.email.toLowerCase());
  if (!isConfiguredAdmin || user.role === ADMIN_ROLE) {
    return user;
  }
  const promoted = await updateUser(user.id, { role: ADMIN_ROLE });
  if (promoted) {
    console.info("[auth] admin bootstrap promoted user", { userId: user.id, email: user.email, reason });
    return promoted;
  }
  return user;
}

function toUserPayload(user: {
  id: string;
  username: string;
  email: string;
  avatarBase64?: string;
  bio?: string;
  createdAt: string;
  role?: "user" | "admin";
  isDemo?: boolean;
}) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    avatarBase64: user.avatarBase64 ?? null,
    bio: user.bio ?? null,
    createdAt: user.createdAt,
    role: user.role ?? USER_ROLE,
    isDemo: Boolean(user.isDemo),
  };
}

authRouter.post("/register", authSensitiveRateLimit, async (req, res) => {
  const { username, email, password } = req.body as {
    username?: string;
    email?: string;
    password?: string;
  };

  if (!username || !USERNAME_REGEX.test(username)) return void sendError(res, ErrorCatalog.INVALID_USERNAME);
  if (!email || !EMAIL_REGEX.test(email)) return void sendError(res, ErrorCatalog.INVALID_EMAIL);
  if (!password || password.length < 8) return void sendError(res, ErrorCatalog.WEAK_PASSWORD);
  const normalizedEmail = email.toLowerCase();

  if (await findUserByUsername(username)) return void sendError(res, ErrorCatalog.USERNAME_TAKEN);
  if (await findUserByEmail(normalizedEmail)) return void sendError(res, ErrorCatalog.EMAIL_TAKEN);

  const user = await createUser({ username, email: normalizedEmail, passwordHash: hashPassword(password), role: USER_ROLE });
  const finalUser = await ensureAdminRoleForConfiguredEmail((await findUserById(user.id)) ?? user, "register");
  const token = signAuthToken(finalUser.id, finalUser.role ?? USER_ROLE);
  res.status(201).json({ token, user: toUserPayload(finalUser) });
});

authRouter.post("/login", authSensitiveRateLimit, async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) return void sendError(res, ErrorCatalog.INVALID_CREDENTIALS);
  const normalizedEmail = email.toLowerCase();

  const user = await findUserByEmail(normalizedEmail);
  if (!user) return void sendError(res, ErrorCatalog.INVALID_CREDENTIALS);
  if (!verifyPassword(password, user.passwordHash)) return void sendError(res, ErrorCatalog.INVALID_CREDENTIALS);

  const finalUser = await ensureAdminRoleForConfiguredEmail(user, "login");
  const token = signAuthToken(finalUser.id, finalUser.role ?? USER_ROLE);
  res.status(200).json({ token, user: toUserPayload(finalUser) });
});

authRouter.post("/logout", (_req, res) => res.status(200).json({ ok: true }));

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await findUserById(req.userId!);
  if (!user) {
    return void sendError(res, ErrorCatalog.NOT_FOUND);
  }
  const finalUser = await ensureAdminRoleForConfiguredEmail(user, "auth_me");
  const payload = toUserPayload(finalUser);
  const token = signAuthToken(finalUser.id, finalUser.role ?? USER_ROLE);
  res.status(200).json({ user: payload, token });
});

authRouter.patch("/me", requireAuth, async (req, res) => {
  const { username, email, bio, avatarBase64 } = req.body as {
    username?: string;
    email?: string;
    bio?: string;
    avatarBase64?: string;
  };

  if (username !== undefined && !USERNAME_REGEX.test(username)) return void sendError(res, ErrorCatalog.INVALID_USERNAME);
  if (email !== undefined && !EMAIL_REGEX.test(email)) return void sendError(res, ErrorCatalog.INVALID_EMAIL);

  if (username) {
    const existing = await findUserByUsername(username);
    if (existing && existing.id !== req.userId) return void sendError(res, ErrorCatalog.USERNAME_TAKEN);
  }
  if (email) {
    const normalizedEmail = email.toLowerCase();
    const existing = await findUserByEmail(normalizedEmail);
    if (existing && existing.id !== req.userId) return void sendError(res, ErrorCatalog.EMAIL_TAKEN);
  }

  const user = await updateUser(req.userId!, {
    ...(username !== undefined ? { username } : {}),
    ...(email !== undefined ? { email: email.toLowerCase() } : {}),
    ...(bio !== undefined ? { bio } : {}),
    ...(avatarBase64 !== undefined ? { avatarBase64 } : {}),
  });

  if (!user) return void sendError(res, ErrorCatalog.NOT_FOUND);
  res.status(200).json(toUserPayload(user));
});

authRouter.post("/change-password", requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
  if (!currentPassword || !newPassword || newPassword.length < 8) return void sendError(res, ErrorCatalog.INVALID_PASSWORD);

  const user = await findUserById(req.userId!);
  if (!user || !verifyPassword(currentPassword, user.passwordHash)) return void sendError(res, ErrorCatalog.INVALID_CREDENTIALS);

  await updateUser(user.id, { passwordHash: hashPassword(newPassword) });
  res.status(200).json({ ok: true });
});

authRouter.delete("/me", requireAuth, async (req, res) => {
  await deleteUserCascade(req.userId!);
  res.status(200).json({ ok: true });
});

export default authRouter;
