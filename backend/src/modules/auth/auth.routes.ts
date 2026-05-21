import { Router, type NextFunction, type Request, type Response } from "express";
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
import { issueEmailVerificationForUser, resendVerificationByEmail, verifyEmailToken } from "../../services/emailVerification";
import { isEmailVerificationBypassEnabled } from "../../config/env";
import { normalizeThemePresetId } from "../personalization/themePresetCatalog";

const authRouter = Router();

const USERNAME_REGEX = /^\w{3,30}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ADMIN_ROLE = "admin" as const;
const USER_ROLE = "user" as const;
const RECOMMENDATION_MODES = new Set(["safe_familiar", "balanced", "mostly_discovery"] as const);
const REPEATED_ARTIST_TOLERANCE = new Set(["lower", "normal", "higher"] as const);
const ENERGY_PREFERENCES = new Set(["calmer", "mixed", "more_energetic"] as const);

function asyncHandler(handler: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res, next).catch(next);
  };
}

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

export function toUserPayload(user: {
  id: string;
  username: string;
  email: string;
  recommendationDataSharingEnabled?: boolean;
  recommendationMode?: "safe_familiar" | "balanced" | "mostly_discovery";
  repeatedArtistTolerance?: "lower" | "normal" | "higher";
  energyPreference?: "calmer" | "mixed" | "more_energetic";
  themePresetId?: string | null;
  avatarBase64?: string;
  bio?: string;
  createdAt: string;
  emailVerifiedAt?: string | null;
  role?: "user" | "admin";
  isDemo?: boolean;
}) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    recommendationDataSharingEnabled: Boolean(user.recommendationDataSharingEnabled),
    recommendationMode: user.recommendationMode ?? "balanced",
    repeatedArtistTolerance: user.repeatedArtistTolerance ?? "normal",
    energyPreference: user.energyPreference ?? "mixed",
    themePresetId: normalizeThemePresetId(user.themePresetId),
    avatarBase64: user.avatarBase64 ?? null,
    bio: user.bio ?? null,
    createdAt: user.createdAt,
    emailVerified: Boolean(user.emailVerifiedAt),
    role: user.role ?? USER_ROLE,
    isDemo: Boolean(user.isDemo),
  };
}

authRouter.post("/register", authSensitiveRateLimit, asyncHandler(async (req, res) => {
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

  const user = await createUser({
    username,
    email: normalizedEmail,
    passwordHash: hashPassword(password),
    recommendationDataSharingEnabled: false,
    recommendationMode: "balanced",
    repeatedArtistTolerance: "normal",
    energyPreference: "mixed",
    role: USER_ROLE,
    emailVerifiedAt: undefined,
  });
  const finalUser = await ensureAdminRoleForConfiguredEmail((await findUserById(user.id)) ?? user, "register");
  const emailVerificationBypassed = isEmailVerificationBypassEnabled();

  if (!emailVerificationBypassed) {
    await issueEmailVerificationForUser(finalUser);
    res.status(201).json({
      requiresEmailVerification: true,
      user: toUserPayload(finalUser),
    });
    return;
  }

  const token = signAuthToken(finalUser.id, finalUser.role ?? USER_ROLE);
  res.status(201).json({
    requiresEmailVerification: false,
    token,
    user: toUserPayload(finalUser),
  });
}));

authRouter.post("/login", authSensitiveRateLimit, asyncHandler(async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) return void sendError(res, ErrorCatalog.INVALID_CREDENTIALS);
  const normalizedEmail = email.toLowerCase();

  const user = await findUserByEmail(normalizedEmail);
  if (!user) return void sendError(res, ErrorCatalog.INVALID_CREDENTIALS);
  if (!verifyPassword(password, user.passwordHash)) return void sendError(res, ErrorCatalog.INVALID_CREDENTIALS);
  if (!user.emailVerifiedAt && !isEmailVerificationBypassEnabled()) return void sendError(res, ErrorCatalog.EMAIL_NOT_VERIFIED);

  const finalUser = await ensureAdminRoleForConfiguredEmail(user, "login");
  const token = signAuthToken(finalUser.id, finalUser.role ?? USER_ROLE);
  res.status(200).json({ token, user: toUserPayload(finalUser) });
}));

authRouter.post("/verify-email", authSensitiveRateLimit, asyncHandler(async (req, res) => {
  const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
  if (!token || token.length < 20) {
    return void sendError(res, ErrorCatalog.INVALID_VERIFICATION_TOKEN);
  }

  const user = await verifyEmailToken(token);
  if (!user) {
    return void sendError(res, ErrorCatalog.INVALID_VERIFICATION_TOKEN);
  }
  const finalUser = await ensureAdminRoleForConfiguredEmail(user, "auth_me");
  const authToken = signAuthToken(finalUser.id, finalUser.role ?? USER_ROLE);
  res.status(200).json({ token: authToken, user: toUserPayload(finalUser) });
}));

authRouter.post("/resend-verification", authSensitiveRateLimit, asyncHandler(async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (!email || !EMAIL_REGEX.test(email)) {
    return void sendError(res, ErrorCatalog.INVALID_EMAIL);
  }
  await resendVerificationByEmail(email);
  res.status(200).json({ ok: true });
}));

authRouter.post("/logout", (_req, res) => res.status(200).json({ ok: true }));

authRouter.get("/me", requireAuth, asyncHandler(async (req, res) => {
  const user = await findUserById(req.userId!);
  if (!user) {
    return void sendError(res, ErrorCatalog.UNAUTHORIZED);
  }
  const finalUser = await ensureAdminRoleForConfiguredEmail(user, "auth_me");
  const payload = toUserPayload(finalUser);
  const token = signAuthToken(finalUser.id, finalUser.role ?? USER_ROLE);
  res.status(200).json({ user: payload, token });
}));

authRouter.patch("/me", requireAuth, asyncHandler(async (req, res) => {
  const { username, email, bio, avatarBase64 } = req.body as {
    username?: string;
    email?: string;
    bio?: string;
    avatarBase64?: string;
    recommendationDataSharingEnabled?: boolean;
    recommendationMode?: "safe_familiar" | "balanced" | "mostly_discovery";
    repeatedArtistTolerance?: "lower" | "normal" | "higher";
    energyPreference?: "calmer" | "mixed" | "more_energetic";
  };

  if (
    req.body?.recommendationDataSharingEnabled !== undefined
    && typeof req.body.recommendationDataSharingEnabled !== "boolean"
  ) {
    return void sendError(res, ErrorCatalog.VALIDATION_ERROR);
  }
  if (req.body?.recommendationMode !== undefined && !RECOMMENDATION_MODES.has(req.body.recommendationMode)) {
    return void sendError(res, ErrorCatalog.VALIDATION_ERROR);
  }
  if (req.body?.repeatedArtistTolerance !== undefined && !REPEATED_ARTIST_TOLERANCE.has(req.body.repeatedArtistTolerance)) {
    return void sendError(res, ErrorCatalog.VALIDATION_ERROR);
  }
  if (req.body?.energyPreference !== undefined && !ENERGY_PREFERENCES.has(req.body.energyPreference)) {
    return void sendError(res, ErrorCatalog.VALIDATION_ERROR);
  }

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
    ...(email !== undefined ? { emailVerifiedAt: null } : {}),
    ...(bio !== undefined ? { bio } : {}),
    ...(avatarBase64 !== undefined ? { avatarBase64 } : {}),
    ...(req.body?.recommendationDataSharingEnabled !== undefined ? { recommendationDataSharingEnabled: req.body.recommendationDataSharingEnabled } : {}),
    ...(req.body?.recommendationMode !== undefined ? { recommendationMode: req.body.recommendationMode } : {}),
    ...(req.body?.repeatedArtistTolerance !== undefined ? { repeatedArtistTolerance: req.body.repeatedArtistTolerance } : {}),
    ...(req.body?.energyPreference !== undefined ? { energyPreference: req.body.energyPreference } : {}),
  });

  if (!user) return void sendError(res, ErrorCatalog.NOT_FOUND);
  if (email !== undefined && !isEmailVerificationBypassEnabled()) {
    await issueEmailVerificationForUser(user);
  }
  res.status(200).json(toUserPayload(user));
}));

authRouter.post("/change-password", requireAuth, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
  if (!currentPassword || !newPassword || newPassword.length < 8) return void sendError(res, ErrorCatalog.INVALID_PASSWORD);

  const user = await findUserById(req.userId!);
  if (!user || !verifyPassword(currentPassword, user.passwordHash)) return void sendError(res, ErrorCatalog.INVALID_CREDENTIALS);

  await updateUser(user.id, { passwordHash: hashPassword(newPassword) });
  res.status(200).json({ ok: true });
}));

authRouter.delete("/me", requireAuth, asyncHandler(async (req, res) => {
  await deleteUserCascade(req.userId!);
  res.status(200).json({ ok: true });
}));

export default authRouter;
