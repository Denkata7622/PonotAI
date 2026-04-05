"use client";

import { useCallback, useEffect, useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";

export interface SmartPositionOptions {
  anchorRef: RefObject<HTMLElement | null>;
  contentRef: RefObject<HTMLElement | null>;
  preferredPosition?: "bottom" | "top" | "left" | "right";
  offset?: number;
  boundaryPadding?: number;
}

export interface SmartPositionResult {
  top: number;
  left: number;
  actualPosition: "bottom" | "top" | "left" | "right";
  maxHeight: number;
  style: CSSProperties;
}

type Direction = "bottom" | "top" | "left" | "right";

const DEFAULT_RESULT: SmartPositionResult = {
  top: 0,
  left: 0,
  actualPosition: "bottom",
  maxHeight: 0,
  style: {
    position: "fixed",
    top: 0,
    left: 0,
    maxHeight: 0,
  },
};

function getPlayerBarHeight(): number {
  if (typeof document === "undefined") return 0;
  const playerBar = document.querySelector<HTMLElement>("[data-player-bar]");
  return playerBar?.getBoundingClientRect().height ?? 0;
}

export function useSmartPosition({
  anchorRef,
  contentRef,
  preferredPosition = "bottom",
  offset = 8,
  boundaryPadding = 12,
}: SmartPositionOptions): SmartPositionResult {
  const [result, setResult] = useState<SmartPositionResult>(DEFAULT_RESULT);

  const calculate = useCallback(() => {
    const anchorEl = anchorRef.current;
    const contentEl = contentRef.current;
    if (!anchorEl || !contentEl || typeof window === "undefined") return;

    const anchorRect = anchorEl.getBoundingClientRect();
    const contentRect = contentEl.getBoundingClientRect();

    const viewportWidth = window.innerWidth;
    const visualViewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const playerBarHeight = getPlayerBarHeight();
    const effectiveBottom = playerBarHeight > 0
      ? Math.min(visualViewportHeight, window.innerHeight - playerBarHeight)
      : visualViewportHeight;

    const contentWidth = contentRect.width || contentEl.offsetWidth || anchorRect.width;
    const contentHeight = contentRect.height || contentEl.offsetHeight || 240;

    const spaces = {
      top: anchorRect.top - boundaryPadding,
      bottom: effectiveBottom - anchorRect.bottom - boundaryPadding,
      left: anchorRect.left - boundaryPadding,
      right: viewportWidth - anchorRect.right - boundaryPadding,
    } as const;

    const preferredFits = spaces[preferredPosition] >= Math.min(contentHeight, 80);

    let actualPosition: Direction = preferredPosition;
    if (anchorRect.top <= 100) {
      actualPosition = "bottom";
    } else if (!preferredFits || spaces[preferredPosition] < 80) {
      actualPosition = (Object.entries(spaces) as Array<[Direction, number]>).sort((a, b) => b[1] - a[1])[0][0];
    }

    let top = 0;
    let left = 0;

    if (actualPosition === "bottom") {
      top = anchorRect.bottom + offset;
      left = anchorRect.left;
      if (anchorRect.right + contentWidth > viewportWidth - boundaryPadding) {
        left = anchorRect.right - contentWidth;
      }
    } else if (actualPosition === "top") {
      top = anchorRect.top - contentHeight - offset;
      left = anchorRect.left;
      if (anchorRect.right + contentWidth > viewportWidth - boundaryPadding) {
        left = anchorRect.right - contentWidth;
      }
    } else if (actualPosition === "left") {
      top = anchorRect.top;
      left = anchorRect.left - contentWidth - offset;
      if (anchorRect.bottom + contentHeight > effectiveBottom - boundaryPadding) {
        top = anchorRect.bottom - contentHeight;
      }
    } else {
      top = anchorRect.top;
      left = anchorRect.right + offset;
      if (anchorRect.bottom + contentHeight > effectiveBottom - boundaryPadding) {
        top = anchorRect.bottom - contentHeight;
      }
    }

    top = Math.max(boundaryPadding, Math.min(top, effectiveBottom - contentHeight - boundaryPadding));
    left = Math.max(boundaryPadding, Math.min(left, viewportWidth - contentWidth - boundaryPadding));

    const verticalAvailable = actualPosition === "top"
      ? anchorRect.top - offset - boundaryPadding
      : actualPosition === "bottom"
        ? effectiveBottom - anchorRect.bottom - offset - boundaryPadding
        : effectiveBottom - boundaryPadding * 2;
    const maxHeight = Math.max(80, verticalAvailable);

    setResult({
      top,
      left,
      actualPosition,
      maxHeight,
      style: {
        position: "fixed",
        top,
        left,
        maxHeight,
      },
    });
  }, [anchorRef, boundaryPadding, contentRef, offset, preferredPosition]);

  useLayoutEffect(() => {
    calculate();
  }, [calculate]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const resizeObserver = new ResizeObserver(() => calculate());
    if (anchorRef.current) resizeObserver.observe(anchorRef.current);
    if (contentRef.current) resizeObserver.observe(contentRef.current);

    const onScroll = () => calculate();
    const onResize = () => calculate();
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
    };
  }, [anchorRef, calculate, contentRef]);

  return result;
}

export default useSmartPosition;
