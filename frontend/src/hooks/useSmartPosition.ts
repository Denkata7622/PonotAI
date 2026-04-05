'use client';

import { useCallback, useEffect, useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";

export interface SmartPositionOptions {
  anchorRef: RefObject<HTMLElement | null>;
  contentRef: RefObject<HTMLElement | null>;
  preferredPosition?: "bottom" | "top" | "left" | "right";
  offset?: number;
  boundaryPadding?: number;
}

export function useSmartPosition({
  anchorRef,
  contentRef,
  offset = 8,
  boundaryPadding = 12,
}: SmartPositionOptions): CSSProperties {
  const [style, setStyle] = useState<CSSProperties>({ visibility: "hidden", position: "fixed" });

  const calculate = useCallback(() => {
    const anchor = anchorRef.current;
    const content = contentRef.current;
    if (!anchor || !content || typeof window === "undefined") return;

    const anchorRect = anchor.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    const playerBar = document.querySelector("[data-player-bar]");
    const playerBarHeight = playerBar ? playerBar.getBoundingClientRect().height : 0;
    const padding = boundaryPadding;
    const bottomBoundary = window.innerHeight - playerBarHeight - padding;
    const rightBoundary = window.innerWidth - padding;

    const spaceBelow = bottomBoundary - anchorRect.bottom - offset;
    const spaceAbove = anchorRect.top - padding - offset;
    const contentH = contentRect.height || 300;
    const contentW = contentRect.width || 200;

    if (process.env.NODE_ENV === "development") {
      console.debug("[useSmartPosition] calculate", {
        anchorBottom: anchorRect.bottom,
        contentHeight: contentH,
        offset,
        bottomBoundary,
        flipCondition: anchorRect.bottom + contentH + offset > bottomBoundary,
      });
    }

    let top: number;
    let maxHeight: number;
    if (spaceBelow >= contentH || spaceBelow >= spaceAbove) {
      top = anchorRect.bottom + offset;
      maxHeight = Math.max(80, spaceBelow);
    } else {
      top = Math.max(padding, anchorRect.top - offset - Math.min(contentH, spaceAbove));
      maxHeight = Math.max(80, spaceAbove);
    }

    let left = anchorRect.left;
    if (left + contentW > rightBoundary) {
      left = Math.max(padding, anchorRect.right - contentW);
    }

    setStyle({
      position: "fixed",
      top,
      left,
      maxHeight,
      overflowY: "auto",
      visibility: "visible",
      zIndex: 9999,
    });
  }, [anchorRef, boundaryPadding, contentRef, offset]);

  useLayoutEffect(() => {
    calculate();
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    window.addEventListener("resize", calculate);
    window.addEventListener("scroll", calculate, { capture: true, passive: true });
    const resizeObserver = new ResizeObserver(calculate);
    if (anchorRef.current) resizeObserver.observe(anchorRef.current);
    if (contentRef.current) resizeObserver.observe(contentRef.current);

    return () => {
      window.removeEventListener("resize", calculate);
      window.removeEventListener("scroll", calculate, true);
      resizeObserver.disconnect();
    };
  }, [anchorRef, calculate, contentRef]);

  return style;
}

export default useSmartPosition;
