'use client';

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useDualSidebar } from "./sidebars/DualSidebarContext";
import { Sparkles } from "lucide-react";
import { useUser } from "@/src/context/UserContext";

export default function AssistantFAB() {
  const pathname = usePathname();
  const router = useRouter();
  const { openPanel } = useDualSidebar();
  const { isAuthenticated } = useUser();
  const [pulse, setPulse] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [bottom, setBottom] = useState("24px");

  useEffect(() => {
    setMounted(true);
    setPulse(window.localStorage.getItem("ponotai.assistant.seen") === null);

    const updateBottomOffset = () => {
      const playerBar = document.querySelector<HTMLElement>("[data-player-bar]");
      const playerBarHeight = playerBar?.getBoundingClientRect().height ?? 0;
      const bottomOffset = Math.min(playerBarHeight + 16, window.innerHeight * 0.3);
      setBottom(bottomOffset > 0 ? `${bottomOffset}px` : "24px");
    };

    updateBottomOffset();
    if (process.env.NODE_ENV === "development") {
      console.debug("[AssistantFAB] pathname", pathname);
    }
    window.addEventListener("resize", updateBottomOffset);
    window.addEventListener("scroll", updateBottomOffset, { passive: true, capture: true });
    return () => {
      window.removeEventListener("resize", updateBottomOffset);
      window.removeEventListener("scroll", updateBottomOffset, true);
    };
  }, [pathname]);

  if (!mounted || pathname === "/assistant") {
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
        if (!isAuthenticated) {
          router.push("/auth");
          return;
        }
        openPanel("assistant");
      }}
      aria-label="Music Assistant"
    >
      <Sparkles width={24} height={24} />
    </button>
  );
}
