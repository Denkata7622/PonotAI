'use client';

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
  const [bottom, setBottom] = useState("24px");

  useEffect(() => {
    setMounted(true);
    setPulse(window.localStorage.getItem("ponotai.assistant.seen") === null);

    const updateBottomOffset = () => {
      const raw = getComputedStyle(document.documentElement).getPropertyValue("--player-bar-height");
      const playerBarHeight = Number.parseInt(raw || "0", 10);
      setBottom(playerBarHeight > 0 ? `${playerBarHeight + 16}px` : "24px");
    };

    updateBottomOffset();
    window.addEventListener("resize", updateBottomOffset);
    return () => {
      window.removeEventListener("resize", updateBottomOffset);
    };
  }, []);

  if (!mounted || !isAuthenticated || pathname === "/assistant") {
    return null;
  }

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
