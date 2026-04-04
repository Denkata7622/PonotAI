"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { useUser } from "@/src/context/UserContext";

export default function AssistantFAB() {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated } = useUser();
  const [pulse, setPulse] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof window === "undefined") return;
    setPulse(window.localStorage.getItem("ponotai.assistant.seen") === null);
  }, []);

  if (!mounted || !isAuthenticated || pathname === "/assistant") {
    return null;
  }

  const playerBarHeight = typeof window !== "undefined"
    ? Number.parseInt(getComputedStyle(document.documentElement).getPropertyValue("--player-bar-height") || "0", 10)
    : 0;

  const bottom = playerBarHeight > 0 ? `${playerBarHeight + 16}px` : "24px";

  return (
    <button
      type="button"
      className={`assistant-fab ${pulse ? "fab--pulse" : ""}`}
      style={{ bottom }}
      onClick={() => {
        window.localStorage.setItem("ponotai.assistant.seen", "1");
        setPulse(false);
        router.push("/assistant");
      }}
      aria-label="Music Assistant"
    >
      <Sparkles width={24} height={24} />
    </button>
  );
}
