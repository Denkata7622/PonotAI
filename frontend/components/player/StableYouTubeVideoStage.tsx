"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import { YT_MOUNT_CONNECTED_EVENT, YT_STAGE_MOUNTED_EVENT } from "../../lib/playerEvents";

type StableYouTubeVideoStageProps = {
  collapsedSlot: HTMLDivElement | null;
  expandedSlot: HTMLDivElement | null;
  isExpanded: boolean;
  hasActiveVideo: boolean;
};

type StageLayout = {
  left: number;
  top: number;
  width: number;
  height: number;
  opacity: number;
  pointerEvents: "auto" | "none";
};

const OFFSCREEN_LAYOUT: StageLayout = {
  left: -10000,
  top: -10000,
  width: 1,
  height: 1,
  opacity: 0,
  pointerEvents: "none",
};

const DEBUG_STAGE = process.env.NODE_ENV !== "production";

export default function StableYouTubeVideoStage({ collapsedSlot, expandedSlot, isExpanded, hasActiveVideo }: StableYouTubeVideoStageProps) {
  const pathname = usePathname();
  const rafRef = useRef<number[]>([]);
  const stageMountContainerRef = useRef<HTMLDivElement | null>(null);
  const [layout, setLayout] = useState<StageLayout>(OFFSCREEN_LAYOUT);

  useLayoutEffect(() => {
    const mountContainer = stageMountContainerRef.current;
    if (mountContainer) {
      const existingNode = document.getElementById("ponotai-yt-player");
      const mountNode = existingNode ?? document.createElement("div");
      if (!existingNode) {
        mountNode.id = "ponotai-yt-player";
      }
      mountNode.className = "h-full w-full";
      if (mountNode.parentElement !== mountContainer) {
        mountContainer.appendChild(mountNode);
      }
      window.dispatchEvent(new CustomEvent(YT_STAGE_MOUNTED_EVENT));
      window.dispatchEvent(new CustomEvent(YT_MOUNT_CONNECTED_EVENT));
    }

    const resolveTarget = () => (isExpanded ? expandedSlot : collapsedSlot);

    const cancelRaf = () => {
      rafRef.current.forEach((id) => window.cancelAnimationFrame(id));
      rafRef.current = [];
    };

    const updateLayout = () => {
      const target = resolveTarget();
      if (!target || !hasActiveVideo) {
        setLayout(OFFSCREEN_LAYOUT);
        return;
      }
      const rect = target.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) {
        setLayout(OFFSCREEN_LAYOUT);
        return;
      }
      setLayout({
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        opacity: 1,
        pointerEvents: "auto",
      });
      if (DEBUG_STAGE) {
        const stageRect = document.querySelector<HTMLElement>("[data-yt-video-stage]")?.getBoundingClientRect();
        console.debug("[StableYouTubeVideoStage] slot/stage rect", {
          mode: isExpanded ? "expanded" : "collapsed",
          slot: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
          stage: stageRect ? { left: stageRect.left, top: stageRect.top, width: stageRect.width, height: stageRect.height } : null,
        });
      }
    };

    const scheduleUpdate = () => {
      cancelRaf();
      const first = window.requestAnimationFrame(() => {
        updateLayout();
        const second = window.requestAnimationFrame(updateLayout);
        rafRef.current = [second];
      });
      rafRef.current = [first];
    };

    const observer = new ResizeObserver(scheduleUpdate);
    if (collapsedSlot) observer.observe(collapsedSlot);
    if (expandedSlot) observer.observe(expandedSlot);
    const playerBar = document.querySelector("[data-player-bar]");
    if (playerBar) observer.observe(playerBar);

    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("scroll", scheduleUpdate, true);
    window.visualViewport?.addEventListener("resize", scheduleUpdate);

    scheduleUpdate();

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate, true);
      window.visualViewport?.removeEventListener("resize", scheduleUpdate);
      cancelRaf();
    };
  }, [collapsedSlot, expandedSlot, hasActiveVideo, isExpanded, pathname]);

  return (
    <div
      data-yt-video-stage
      style={{
        position: "fixed",
        left: `${layout.left}px`,
        top: `${layout.top}px`,
        width: `${layout.width}px`,
        height: `${layout.height}px`,
        opacity: layout.opacity,
        pointerEvents: layout.pointerEvents,
        zIndex: isExpanded ? 63 : 53,
      }}
      className="overflow-hidden rounded-lg bg-black"
      aria-hidden={!hasActiveVideo}
    >
      <div ref={stageMountContainerRef} className="h-full w-full" />
    </div>
  );
}
