import { ErrorCatalog } from "../errors/errorCatalog";

function requireEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function buildVerificationEmailHtml(verificationUrl: string): string {
  return `<p>Welcome to Trackly.</p><p>Please verify your email by opening this link:</p><p><a href="${verificationUrl}">${verificationUrl}</a></p><p>This link expires in 30 minutes.</p>`;
}

export async function sendVerificationEmail(email: string, verificationUrl: string): Promise<void> {
  const mailerEndpoint = requireEnv("MAILER_API_URL");
  const mailerToken = requireEnv("MAILER_API_TOKEN");
  const from = requireEnv("MAILER_FROM") ?? "no-reply@trackly.local";

  if (!mailerEndpoint || !mailerToken) {
    if (process.env.NODE_ENV === "production") {
      throw Object.assign(new Error("Verification email service is not configured."), { code: ErrorCatalog.SERVICE_UNAVAILABLE.code });
    }
    console.info("[auth] verification link (development)", { email, verificationUrl });
    return;
  }

  const response = await fetch(mailerEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${mailerToken}`,
    },
    body: JSON.stringify({
      to: email,
      from,
      subject: "Verify your Trackly email",
      text: `Verify your email: ${verificationUrl} (expires in 30 minutes)`,
      html: buildVerificationEmailHtml(verificationUrl),
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Verification email delivery failed: HTTP ${response.status}${text ? ` ${text}` : ""}`);
  }
}
