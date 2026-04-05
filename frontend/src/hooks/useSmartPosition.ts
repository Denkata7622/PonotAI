'use client';

import {
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  RefObject,
  CSSProperties,
} from 'react';

export interface SmartPositionOptions {
  anchorRef: RefObject<HTMLElement>;
  contentRef: RefObject<HTMLElement>;
  isOpen: boolean;
  preferredSide?: 'bottom' | 'top';
  offset?: number;
  boundaryPadding?: number;
}

export interface PositionStyle extends CSSProperties {
  position: 'fixed';
  top: number;
  left: number;
  maxHeight: number;
  zIndex: number;
  visibility: 'visible' | 'hidden';
  overflowY: 'auto';
}

const HIDDEN_STYLE: PositionStyle = {
  position: 'fixed',
  top: -9999,
  left: -9999,
  maxHeight: 0,
  zIndex: 9999,
  visibility: 'hidden',
  overflowY: 'auto',
};

export function useSmartPosition(options: SmartPositionOptions): PositionStyle {
  /*
   * ALL useState/useEffect/useLayoutEffect/useCallback calls are here
   * at the TOP LEVEL of this function.
   * NONE of them are inside any callback, condition, loop, or nested function.
   * This is the only legal way to call hooks in React.
   */

  const [style, setStyle] = useState<PositionStyle>(HIDDEN_STYLE);

  /*
   * calculate is defined with useCallback at the TOP LEVEL.
   * The function body inside useCallback is NOT a hook call site —
   * it is a plain function that only calls setStyle (a state setter, not a hook).
   * No hooks are called inside this callback body.
   */
  const calculate = useCallback(() => {
    // ── plain logic only below, no hook calls ──
    const anchor = options.anchorRef.current;
    const content = options.contentRef.current;

    if (!anchor || !content) {
      setStyle(HIDDEN_STYLE);
      return;
    }

    const anchorRect = anchor.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();

    const playerBar = document.querySelector('[data-player-bar]');
    const playerBarH = playerBar
      ? playerBar.getBoundingClientRect().height
      : 0;

    const pad = options.boundaryPadding ?? 12;
    const off = options.offset ?? 8;
    const bottomBoundary = window.innerHeight - playerBarH - pad;
    const rightBoundary = window.innerWidth - pad;

    const contentH = contentRect.height > 10 ? contentRect.height : 280;
    const contentW = contentRect.width > 10 ? contentRect.width : 220;

    const spaceBelow = bottomBoundary - anchorRect.bottom - off;
    const spaceAbove = anchorRect.top - pad - off;

    const wantTop = options.preferredSide === 'top';
    const fitBelow = spaceBelow >= 80;
    const fitAbove = spaceAbove >= 80;

    let top: number;
    let maxHeight: number;

    if (wantTop && fitAbove) {
      maxHeight = Math.max(80, spaceAbove);
      top = anchorRect.top - off - Math.min(contentH, maxHeight);
    } else if (!wantTop && fitBelow) {
      top = anchorRect.bottom + off;
      maxHeight = Math.max(80, spaceBelow);
    } else if (fitAbove) {
      maxHeight = Math.max(80, spaceAbove);
      top = anchorRect.top - off - Math.min(contentH, maxHeight);
    } else {
      top = anchorRect.bottom + off;
      maxHeight = Math.max(80, spaceBelow);
    }

    let left = anchorRect.left;
    if (left + contentW > rightBoundary) {
      left = Math.max(pad, anchorRect.right - contentW);
    }
    left = Math.max(pad, left);
    top = Math.max(pad, top);

    // setStyle is a state setter — calling it here is legal
    setStyle({
      position: 'fixed',
      top,
      left,
      maxHeight,
      zIndex: 9999,
      visibility: 'visible',
      overflowY: 'auto',
    });
  }, [
    options.anchorRef,
    options.contentRef,
    options.isOpen,
    options.preferredSide,
    options.offset,
    options.boundaryPadding,
  ]);

  /*
   * useLayoutEffect — TOP LEVEL hook call.
   * Recalculates position synchronously after DOM updates.
   * No hook calls inside the callback body.
   */
  useLayoutEffect(() => {
    if (!options.isOpen) {
      setStyle(HIDDEN_STYLE);
      return;
    }
    calculate();
  }, [options.isOpen, calculate]);

  /*
   * useEffect — TOP LEVEL hook call.
   * Attaches resize/scroll listeners and ResizeObserver.
   * No hook calls inside the callback body.
   */
  useEffect(() => {
    if (!options.isOpen) return;

    const onResize = () => calculate();
    const onScroll = () => calculate();

    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });

    const ro = new ResizeObserver(() => calculate());
    const anchor = options.anchorRef.current;
    const content = options.contentRef.current;
    if (anchor) ro.observe(anchor);
    if (content) ro.observe(content);

    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, { capture: true });
      ro.disconnect();
    };
  }, [options.isOpen, calculate, options.anchorRef, options.contentRef]);

  return style;
}
