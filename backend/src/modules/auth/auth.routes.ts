import { Router } from "express";
import crypto from "node:crypto";
import {
  createUser,
  deleteUserCascade,
  findUserByEmail,
  findUserById,
  findUserByUsername,
  updateUser,
} from "../../db/authStore";
import { requireAuth, signAuthToken } from "../../middlewares/auth.middleware";
import { authSensitiveRateLimit } from "../../middlewares/rateLimit.middleware";
import { ErrorCatalog, sendError } from "../../errors/errorCatalog";

const authRouter = Router();

const USERNAME_REGEX = /^\w{3,30}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const attempt = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(attempt, "hex"));
}

function toUserPayload(user: {
  id: string;
  username: string;
  email: string;
  avatarBase64?: string;
  bio?: string;
  createdAt: string;
}) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    avatarBase64: user.avatarBase64 ?? null,
    bio: user.bio ?? null,
    createdAt: user.createdAt,
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

  if (await findUserByUsername(username)) return void sendError(res, ErrorCatalog.USERNAME_TAKEN);
  if (await findUserByEmail(email)) return void sendError(res, ErrorCatalog.EMAIL_TAKEN);

  const user = await createUser({ username, email, passwordHash: hashPassword(password) });
  const token = signAuthToken(user.id);
  res.status(201).json({ token, user: toUserPayload(user) });
});

authRouter.post("/login", authSensitiveRateLimit, async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) return void sendError(res, ErrorCatalog.INVALID_CREDENTIALS);

  const user = await findUserByEmail(email);
  if (!user) return void sendError(res, ErrorCatalog.INVALID_CREDENTIALS);
  if (!verifyPassword(password, user.passwordHash)) return void sendError(res, ErrorCatalog.INVALID_CREDENTIALS);

  const token = signAuthToken(user.id);
  res.status(200).json({ token, user: toUserPayload(user) });
});

authRouter.post("/logout", (_req, res) => res.status(200).json({ ok: true }));

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await findUserById(req.userId!);
  if (!user) {
    return res.status(404).json({ code: "USER_NOT_FOUND", message: "User not found" });
  }
  const payload = toUserPayload(user);
  res.status(200).json({ ...payload, user: payload });
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
    const existing = await findUserByEmail(email);
    if (existing && existing.id !== req.userId) return void sendError(res, ErrorCatalog.EMAIL_TAKEN);
  }

  const user = await updateUser(req.userId!, {
    ...(username !== undefined ? { username } : {}),
    ...(email !== undefined ? { email } : {}),
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
