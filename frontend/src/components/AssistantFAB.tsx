'use client';

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useDualSidebar } from "./sidebars/DualSidebarContext";
import { Sparkles } from "../../lucide-react";
import { useUser } from "@/src/context/UserContext";

export default function AssistantFAB() {
  const pathname = usePathname();
  const router = useRouter();
  const { openPanel } = useDualSidebar();
  const { isAuthenticated } = useUser();
  const [pulse, setPulse] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [bottom, setBottom] = useState("24px");
  const [isSongMenuOpen, setIsSongMenuOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
    setPulse(window.localStorage.getItem("ponotai.assistant.seen") === null);

    const updateBottomOffset = () => {
      const isMobile = window.matchMedia("(max-width: 767px)").matches;
      const playerBar = document.querySelector<HTMLElement>("[data-player-bar]");
      const playerBarHeight = playerBar?.getBoundingClientRect().height ?? 0;
      const baseBottomOffset = Math.min(playerBarHeight + 16, window.innerHeight * 0.32);
      const mobileMenuClearance = isMobile ? 120 : 0;
      const bottomOffset = baseBottomOffset + mobileMenuClearance;
      setBottom(bottomOffset > 0 ? `${bottomOffset}px` : isMobile ? "132px" : "24px");
    };
    const handleSongMenuToggle = (event: Event) => {
      const customEvent = event as CustomEvent<{ open?: boolean }>;
      setIsSongMenuOpen(Boolean(customEvent.detail?.open));
    };

    updateBottomOffset();
    window.addEventListener("resize", updateBottomOffset);
    window.addEventListener("scroll", updateBottomOffset, { passive: true, capture: true });
    window.addEventListener("trackly-song-menu-toggle", handleSongMenuToggle as EventListener);
    return () => {
      window.removeEventListener("resize", updateBottomOffset);
      window.removeEventListener("scroll", updateBottomOffset, true);
      window.removeEventListener("trackly-song-menu-toggle", handleSongMenuToggle as EventListener);
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
      data-menu-open={isSongMenuOpen ? "true" : "false"}
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
      <span className="assistant-fab__halo" aria-hidden="true" />
      <span className="assistant-fab__shell" aria-hidden="true">
        <Sparkles width={18} height={18} />
      </span>
    </button>
  );
}
