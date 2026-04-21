'use client';

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@/src/context/UserContext";

const betaBypassEnabled = process.env.NEXT_PUBLIC_AUTH_BYPASS_EMAIL_VERIFICATION === "true";

export default function VerifyEmailClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { verifyEmail } = useUser();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");

  const token = useMemo(() => searchParams.get("token")?.trim() ?? "", [searchParams]);

  useEffect(() => {
    if (betaBypassEnabled) {
      setStatus("success");
      return;
    }

    if (!token) {
      setStatus("error");
      return;
    }

    verifyEmail(token)
      .then(() => {
        setStatus("success");
        setTimeout(() => router.replace("/onboarding"), 1200);
      })
      .catch(() => {
        setStatus("error");
      });
  }, [router, token, verifyEmail]);

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-surface)] p-8 text-center">
        {betaBypassEnabled ? (
          <div className="space-y-4">
            <p>Email verification is temporarily disabled during this beta.</p>
            <button
              type="button"
              className="w-full rounded-xl bg-[var(--accent)] py-2.5 font-semibold text-[var(--accent-foreground)] transition-all hover:opacity-90"
              onClick={() => router.replace("/")}
            >
              Continue to app
            </button>
          </div>
        ) : null}
        {!betaBypassEnabled && status === "loading" && <p>Verifying your email…</p>}
        {!betaBypassEnabled && status === "success" && <p>Email verified. Redirecting you to onboarding…</p>}
        {!betaBypassEnabled && status === "error" && <p>Verification link is invalid or expired. Please request a new one on the sign-in page.</p>}
      </div>
    </div>
  );
}
