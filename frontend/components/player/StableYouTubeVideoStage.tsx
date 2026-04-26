"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import { YT_STAGE_MOUNTED_EVENT } from "../../lib/playerEvents";

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
const COLLAPSED_RETRY_MS = [40, 90, 160, 260];

function toStageLayout(rect: DOMRect | { left: number; top: number; width: number; height: number }): StageLayout {
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    opacity: 1,
    pointerEvents: "auto",
  };
}

function resolveFallbackRectFromPlayerBar(): { left: number; top: number; width: number; height: number } | null {
  const playerBar = document.querySelector<HTMLElement>("[data-player-bar]");
  if (!playerBar) return null;
  const barRect = playerBar.getBoundingClientRect();
  if (barRect.width < 1 || barRect.height < 1) return null;

  const width = Math.max(90, Math.min(106, Math.floor(barRect.width * 0.18)));
  const height = Math.max(48, Math.min(56, Math.floor(barRect.height - 12)));
  const rightInset = 16;
  const left = Math.max(barRect.left + 8, barRect.right - width - rightInset);
  const top = Math.max(barRect.top + 8, barRect.top + Math.min(10, barRect.height - height - 8));
  return { left, top, width, height };
}

export default function StableYouTubeVideoStage({ collapsedSlot, expandedSlot, isExpanded, hasActiveVideo }: StableYouTubeVideoStageProps) {
  const pathname = usePathname();
  const rafRef = useRef<number[]>([]);
  const stageMountContainerRef = useRef<HTMLDivElement | null>(null);
  const collapsedRetryTimeoutsRef = useRef<number[]>([]);
  const [layout, setLayout] = useState<StageLayout>(OFFSCREEN_LAYOUT);

  useLayoutEffect(() => {
    const timeoutIds: number[] = [];
    const eventRafIds: number[] = [];
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
      const dispatchMountedEvent = () => window.dispatchEvent(new CustomEvent(YT_STAGE_MOUNTED_EVENT));
      dispatchMountedEvent();
      eventRafIds.push(window.requestAnimationFrame(dispatchMountedEvent));
      timeoutIds.push(window.setTimeout(dispatchMountedEvent, 50));
    }

    const resolveTarget = () => (isExpanded ? expandedSlot : collapsedSlot);

    const cancelRaf = () => {
      rafRef.current.forEach((id) => window.cancelAnimationFrame(id));
      rafRef.current = [];
    };

    const clearCollapsedRetries = () => {
      collapsedRetryTimeoutsRef.current.forEach((id) => window.clearTimeout(id));
      collapsedRetryTimeoutsRef.current = [];
    };

    const scheduleCollapsedRetries = () => {
      if (isExpanded || !hasActiveVideo) return;
      if (collapsedRetryTimeoutsRef.current.length > 0) return;
      collapsedRetryTimeoutsRef.current = COLLAPSED_RETRY_MS.map((delayMs) =>
        window.setTimeout(() => {
          scheduleUpdate();
        }, delayMs),
      );
    };

    const updateLayout = () => {
      const mode = isExpanded ? "expanded" : "collapsed";
      const target = resolveTarget();
      if (!hasActiveVideo) {
        setLayout(OFFSCREEN_LAYOUT);
        return;
      }

      if (isExpanded) {
        if (!target) {
          setLayout(OFFSCREEN_LAYOUT);
          return;
        }
        const expandedRect = target.getBoundingClientRect();
        if (expandedRect.width < 1 || expandedRect.height < 1) {
          setLayout(OFFSCREEN_LAYOUT);
          return;
        }
        const nextLayout = toStageLayout(expandedRect);
        setLayout(nextLayout);
        if (DEBUG_STAGE) {
          console.debug("[StableYouTubeVideoStage] layout update", {
            mode,
            collapsedSlotExists: Boolean(collapsedSlot),
            collapsedRect: null,
            fallbackUsed: false,
            targetType: "expanded-slot",
            measuredRect: { left: expandedRect.left, top: expandedRect.top, width: expandedRect.width, height: expandedRect.height },
            finalStageRect: nextLayout,
          });
        }
        return;
      }

      const collapsedRect = target?.getBoundingClientRect() ?? null;
      const collapsedReady = Boolean(collapsedRect && collapsedRect.width >= 1 && collapsedRect.height >= 1);
      if (collapsedReady && collapsedRect) {
        clearCollapsedRetries();
        const nextLayout = toStageLayout(collapsedRect);
        setLayout(nextLayout);
        if (DEBUG_STAGE) {
          console.debug("[StableYouTubeVideoStage] layout update", {
            mode,
            collapsedSlotExists: Boolean(collapsedSlot),
            collapsedRect: { width: collapsedRect.width, height: collapsedRect.height },
            fallbackUsed: false,
            targetType: "collapsed-slot",
            measuredRect: { left: collapsedRect.left, top: collapsedRect.top, width: collapsedRect.width, height: collapsedRect.height },
            finalStageRect: nextLayout,
          });
        }
        return;
      }

      scheduleCollapsedRetries();
      const fallbackRect = resolveFallbackRectFromPlayerBar();
      if (!fallbackRect) {
        setLayout(OFFSCREEN_LAYOUT);
        return;
      }
      const nextLayout = {
        ...toStageLayout(fallbackRect),
        pointerEvents: "none" as const,
      };
      setLayout(nextLayout);
      if (DEBUG_STAGE) {
        console.debug("[StableYouTubeVideoStage] layout update", {
          mode,
          collapsedSlotExists: Boolean(collapsedSlot),
          collapsedRect: collapsedRect ? { width: collapsedRect.width, height: collapsedRect.height } : null,
          fallbackUsed: true,
          targetType: "fallback-player-bar",
          measuredRect: collapsedRect ? { left: collapsedRect.left, top: collapsedRect.top, width: collapsedRect.width, height: collapsedRect.height } : null,
          finalStageRect: nextLayout,
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

    updateLayout();
    scheduleUpdate();
    timeoutIds.push(window.setTimeout(scheduleUpdate, 80));
    timeoutIds.push(window.setTimeout(scheduleUpdate, 180));
    timeoutIds.push(window.setTimeout(scheduleUpdate, 320));

    return () => {
      eventRafIds.forEach((id) => window.cancelAnimationFrame(id));
      timeoutIds.forEach((id) => window.clearTimeout(id));
      clearCollapsedRetries();
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
