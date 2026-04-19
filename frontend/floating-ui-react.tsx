'use client';

import {
  cloneElement,
  createElement,
  type CSSProperties,
  type HTMLProps,
  type MutableRefObject,
  type ReactElement,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

export type Placement = "bottom-start" | "bottom" | "top-start" | "top";

type FloatingContext = {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  refs: {
    reference: MutableRefObject<HTMLElement | null>;
    floating: MutableRefObject<HTMLElement | null>;
  };
};

type MiddlewareState = {
  x: number;
  y: number;
  referenceRect: DOMRect;
  floatingRect: DOMRect;
  floatingEl: HTMLElement;
  viewportWidth: number;
  viewportHeight: number;
};

type MiddlewareFn = (state: MiddlewareState) => MiddlewareState;

export function offset(value: number): MiddlewareFn {
  return (state) => ({ ...state, y: state.y + value });
}

export function flip(options?: { padding?: number | { top?: number; right?: number; bottom?: number; left?: number }; fallbackAxisSideDirection?: "start" | "end" }): MiddlewareFn {
  return (state) => {
    const pad = typeof options?.padding === "number" ? options.padding : options?.padding?.bottom ?? 12;
    const next = { ...state };
    if (next.y + next.floatingRect.height > next.viewportHeight - pad) {
      next.y = next.referenceRect.top - next.floatingRect.height - 6;
    }
    return next;
  };
}

export function shift(options?: { padding?: number | { top?: number; right?: number; bottom?: number; left?: number } }): MiddlewareFn {
  return (state) => {
    const p = typeof options?.padding === "number"
      ? { top: options.padding, right: options.padding, bottom: options.padding, left: options.padding }
      : {
          top: options?.padding?.top ?? 12,
          right: options?.padding?.right ?? 12,
          bottom: options?.padding?.bottom ?? 12,
          left: options?.padding?.left ?? 12,
        };
    const next = { ...state };
    next.x = Math.max(p.left, Math.min(next.x, next.viewportWidth - next.floatingRect.width - p.right));
    next.y = Math.max(p.top, Math.min(next.y, next.viewportHeight - next.floatingRect.height - p.bottom));
    return next;
  };
}

export function size(options: { apply: (args: { rects: { reference: DOMRect; floating: DOMRect }; elements: { floating: HTMLElement } }) => void; padding?: number }): MiddlewareFn {
  return (state) => {
    options.apply({ rects: { reference: state.referenceRect, floating: state.floatingRect }, elements: { floating: state.floatingEl } });
    return state;
  };
}

export function autoUpdate(
  reference: HTMLElement,
  floating: HTMLElement,
  update: () => void,
): () => void {
  const onResize = () => update();
  const onScroll = () => update();
  window.addEventListener("resize", onResize, { passive: true });
  window.addEventListener("scroll", onScroll, { passive: true, capture: true });
  const ResizeObserverCtor = window.ResizeObserver;
  const ro = ResizeObserverCtor ? new ResizeObserverCtor(() => update()) : null;
  ro?.observe(reference);
  ro?.observe(floating);
  return () => {
    window.removeEventListener("resize", onResize);
    window.removeEventListener("scroll", onScroll, true);
    ro?.disconnect();
  };
}

export function useFloating(options: {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  placement?: Placement;
  whileElementsMounted?: (reference: HTMLElement, floating: HTMLElement, update: () => void) => () => void;
  middleware?: MiddlewareFn[];
}) {
  const referenceRef = useRef<HTMLElement | null>(null);
  const floatingRef = useRef<HTMLElement | null>(null);
  const [floatingStyles, setFloatingStyles] = useState<CSSProperties>({ position: "fixed", top: 0, left: 0 });

  const update = useMemo(
    () => () => {
      const reference = referenceRef.current;
      const floating = floatingRef.current;
      if (!reference || !floating) return;
      const referenceRect = reference.getBoundingClientRect();
      const floatingRect = floating.getBoundingClientRect();
      let state: MiddlewareState = {
        x: referenceRect.left,
        y: options.placement?.startsWith("top") ? referenceRect.top - floatingRect.height - 6 : referenceRect.bottom + 6,
        referenceRect,
        floatingRect,
        floatingEl: floating,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      };
      for (const middleware of options.middleware ?? []) {
        state = middleware(state);
      }
      setFloatingStyles({ position: "fixed", left: state.x, top: state.y });
    },
    [options.middleware, options.placement],
  );

  useEffect(() => {
    if (!options.open) return;
    update();
    const reference = referenceRef.current;
    const floating = floatingRef.current;
    if (!reference || !floating || !options.whileElementsMounted) return;
    return options.whileElementsMounted(reference, floating, update);
  }, [options.open, options.whileElementsMounted, update]);

  const refs = {
    setReference: (node: HTMLElement | null) => {
      referenceRef.current = node;
    },
    setFloating: (node: HTMLElement | null) => {
      floatingRef.current = node;
    },
  };

  const context: FloatingContext = {
    open: options.open,
    onOpenChange: options.onOpenChange,
    refs: { reference: referenceRef, floating: floatingRef },
  };
  return { refs, floatingStyles, context };
}

export function useClick(context: FloatingContext) {
  return {
    getReferenceProps: <T extends HTMLProps<Element>>(props: T) => ({
      ...props,
      onClick: (event: unknown) => {
        props.onClick?.(event as never);
        context.onOpenChange?.(!context.open);
      },
    }),
  };
}

export function useDismiss(context: FloatingContext, opts?: { outsidePressEvent?: "pointerdown" | "click" }) {
  useEffect(() => {
    if (!context.open) return;

    const outsidePressEvent = opts?.outsidePressEvent ?? "pointerdown";

    const onOutsidePress = (event: PointerEvent | MouseEvent) => {
      const target = event.target as Node | null;
      const reference = context.refs.reference.current;
      const floating = context.refs.floating.current;
      if (!target) return;
      if (reference?.contains(target) || floating?.contains(target)) return;
      context.onOpenChange?.(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        context.onOpenChange?.(false);
      }
    };

    document.addEventListener(outsidePressEvent, onOutsidePress, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener(outsidePressEvent, onOutsidePress, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [context.open, context.onOpenChange, context.refs.reference, context.refs.floating, opts?.outsidePressEvent]);

  return {
    getFloatingProps: <T extends HTMLProps<Element>>(props: T) => props,
    getReferenceProps: <T extends HTMLProps<Element>>(props: T) => props,
    onOutsidePress: () => context.onOpenChange?.(false),
  };
}

export function useInteractions(interactions: Array<{ getReferenceProps?: <T extends HTMLProps<Element>>(props: T) => T; getFloatingProps?: <T extends HTMLProps<Element>>(props: T) => T }>) {
  return {
    getReferenceProps: <T extends HTMLProps<Element>>(props?: T) =>
      interactions.reduce((acc, interaction) => (interaction.getReferenceProps ? interaction.getReferenceProps(acc) : acc), (props ?? {}) as T),
    getFloatingProps: <T extends HTMLProps<Element>>(props?: T) =>
      interactions.reduce((acc, interaction) => (interaction.getFloatingProps ? interaction.getFloatingProps(acc) : acc), (props ?? {}) as T),
  };
}

export function FloatingPortal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}
