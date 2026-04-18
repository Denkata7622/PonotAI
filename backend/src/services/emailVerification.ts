import crypto from "node:crypto";
import {
  createEmailVerificationToken,
  consumeEmailVerificationToken,
  findUserByEmail,
  findUserById,
  revokeEmailVerificationTokensForUser,
  updateUser,
  type UserRecord,
} from "../db/authStore";
import { sendVerificationEmail } from "./mailer";

const VERIFICATION_TOKEN_TTL_MS = 30 * 60 * 1000;

function hashVerificationToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function getVerificationBaseUrl(): string {
  const explicit = process.env.EMAIL_VERIFICATION_URL_BASE?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const frontendUrl = process.env.FRONTEND_URL?.trim();
  if (frontendUrl) return frontendUrl.replace(/\/$/, "");
  return "http://localhost:3000";
}

async function createAndDeliverVerification(user: UserRecord): Promise<void> {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashVerificationToken(rawToken);
  const expiresAt = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS).toISOString();

  await revokeEmailVerificationTokensForUser(user.id);
  await createEmailVerificationToken({ userId: user.id, tokenHash, expiresAt });

  const verificationUrl = `${getVerificationBaseUrl()}/auth/verify-email?token=${encodeURIComponent(rawToken)}`;
  await sendVerificationEmail(user.email, verificationUrl);
}

export async function issueEmailVerificationForUser(user: UserRecord): Promise<void> {
  if (user.emailVerifiedAt) {
    return;
  }
  await createAndDeliverVerification(user);
}

export async function resendVerificationByEmail(email: string): Promise<void> {
  const user = await findUserByEmail(email.trim().toLowerCase());
  if (!user || user.emailVerifiedAt) return;
  await createAndDeliverVerification(user);
}

export async function verifyEmailToken(rawToken: string): Promise<UserRecord | null> {
  const tokenHash = hashVerificationToken(rawToken.trim());
  const consumed = await consumeEmailVerificationToken(tokenHash);
  if (!consumed) return null;

  const user = await findUserById(consumed.userId);
  if (!user) return null;
  if (user.emailVerifiedAt) return user;

  const updated = await updateUser(user.id, { emailVerifiedAt: new Date().toISOString() });
  return updated;
}
