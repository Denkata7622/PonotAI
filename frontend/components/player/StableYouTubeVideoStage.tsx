"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState, type RefObject } from "react";

type StableYouTubeVideoStageProps = {
  collapsedSlotRef: RefObject<HTMLDivElement | null>;
  expandedSlotRef: RefObject<HTMLDivElement | null>;
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

export default function StableYouTubeVideoStage({ collapsedSlotRef, expandedSlotRef, isExpanded, hasActiveVideo }: StableYouTubeVideoStageProps) {
  const pathname = usePathname();
  const rafRef = useRef<number | null>(null);
  const [layout, setLayout] = useState<StageLayout>(OFFSCREEN_LAYOUT);

  useLayoutEffect(() => {
    const resolveTarget = () => {
      if (isExpanded && expandedSlotRef.current) return expandedSlotRef.current;
      return collapsedSlotRef.current;
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
    };

    const scheduleUpdate = () => {
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;
        updateLayout();
      });
    };

    const observer = new ResizeObserver(scheduleUpdate);
    if (collapsedSlotRef.current) observer.observe(collapsedSlotRef.current);
    if (expandedSlotRef.current) observer.observe(expandedSlotRef.current);

    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("scroll", scheduleUpdate, true);
    window.visualViewport?.addEventListener("resize", scheduleUpdate);

    scheduleUpdate();

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate, true);
      window.visualViewport?.removeEventListener("resize", scheduleUpdate);
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [collapsedSlotRef, expandedSlotRef, hasActiveVideo, isExpanded, pathname]);

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
        zIndex: isExpanded ? 61 : 52,
      }}
      className="overflow-hidden rounded-lg bg-black"
      aria-hidden={!hasActiveVideo}
    >
      <div id="ponotai-yt-player" className="h-full w-full" />
    </div>
  );
}
