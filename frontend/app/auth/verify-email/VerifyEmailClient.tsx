'use client';

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@/src/context/UserContext";

export default function VerifyEmailClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { verifyEmail } = useUser();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");

  useEffect(() => {
    const token = searchParams.get("token")?.trim();
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
  }, [searchParams, router, verifyEmail]);

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-surface)] p-8 text-center">
        {status === "loading" && <p>Verifying your email…</p>}
        {status === "success" && <p>Email verified. Redirecting you to onboarding…</p>}
        {status === "error" && <p>Verification link is invalid or expired. Please request a new one on the sign-in page.</p>}
      </div>
    </div>
  );
}
