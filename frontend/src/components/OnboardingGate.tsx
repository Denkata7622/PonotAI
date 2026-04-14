'use client';

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useUser } from "../context/UserContext";

const ALLOWED_WHEN_PENDING = new Set(["/onboarding", "/auth"]);

export default function OnboardingGate() {
  const pathname = usePathname();
  const router = useRouter();
  const { isLoading, isAuthenticated, onboardingRequired } = useUser();

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;

    const isAllowedPath = Array.from(ALLOWED_WHEN_PENDING).some((path) => pathname === path || pathname.startsWith(`${path}/`));

    if (onboardingRequired && !isAllowedPath) {
      router.replace("/onboarding");
      return;
    }

    if (!onboardingRequired && pathname === "/onboarding") {
      router.replace("/");
    }
  }, [isLoading, isAuthenticated, onboardingRequired, pathname, router]);

  return null;
}
