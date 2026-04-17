'use client';

import {
  ReactNode,
  CSSProperties,
  useEffect,
  useState,
  useCallback,
  useLayoutEffect,
} from 'react';
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  useClick,
  useDismiss,
  useInteractions,
  FloatingPortal,
  size,
  Placement,
} from '@floating-ui/react';

interface SmartDropdownProps {
  trigger: ReactNode;
  children: ReactNode;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  placement?: Placement;
  minWidth?: number;
  matchTriggerWidth?: boolean;
  className?: string;
  bottomPadding?: number;
  enableClickTrigger?: boolean;
}

export function SmartDropdown({
  trigger,
  children,
  isOpen,
  onOpenChange,
  placement = 'bottom-start',
  minWidth,
  matchTriggerWidth = false,
  className,
  bottomPadding,
  enableClickTrigger = true,
}: SmartDropdownProps) {
  const [playerBarPadding, setPlayerBarPadding] = useState(0);
  const [hasReferenceNode, setHasReferenceNode] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const value = Number.parseInt(
      window.getComputedStyle(document.documentElement).getPropertyValue('--player-bar-height') || '0',
      10,
    ) || 0;
    setPlayerBarPadding(value);
  }, []);

  const viewportPadding = {
    top: 12,
    left: 12,
    right: 12,
    bottom: (bottomPadding ?? playerBarPadding) + 12,
  };

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange,
    placement,
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(6),
      flip({
        fallbackAxisSideDirection: 'start',
        padding: viewportPadding,
      }),
      shift({ padding: viewportPadding }),
      size({
        apply({ rects, elements }) {
          const w = matchTriggerWidth
            ? rects.reference.width
            : minWidth
            ? Math.max(minWidth, rects.floating.width)
            : undefined;
          if (w) {
            Object.assign(elements.floating.style, { width: `${w}px` });
          }
        },
        padding: 12,
      }),
    ],
  });

  const click = useClick(context);
  const dismiss = useDismiss(context, {
    outsidePressEvent: 'pointerdown',
  });

  const interactions = enableClickTrigger ? [click, dismiss] : [dismiss];
  const { getReferenceProps, getFloatingProps } = useInteractions(interactions);

  const referenceRef = useCallback((node: HTMLSpanElement | null) => {
    refs.setReference(node);
    setHasReferenceNode(Boolean(node));
  }, [refs]);

  const floatingRef = useCallback((node: HTMLDivElement | null) => {
    refs.setFloating(node);
  }, [refs]);


  useLayoutEffect(() => {
    if (!isOpen || hasReferenceNode) return;
    onOpenChange(false);
  }, [hasReferenceNode, isOpen, onOpenChange]);

  const dropdownStyle: CSSProperties = {
    ...floatingStyles,
    zIndex: 9999,
    background: 'var(--dropdown-bg-solid, var(--dropdown-bg, var(--surface-elevated)))',
    opacity: 1,
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    boxShadow: 'var(--shadow-raised)',
    overflowY: 'auto',
    maxHeight: '80vh',
    backdropFilter: 'none',
    WebkitBackdropFilter: 'none',
    isolation: 'isolate',
  };

  return (
    <>
      <span
        ref={referenceRef}
        {...getReferenceProps()}
        style={{ display: 'inline-block', width: matchTriggerWidth ? '100%' : 'auto' }}
      >
        {trigger}
      </span>

      {isOpen && hasReferenceNode && (
        <FloatingPortal>
          <div
            ref={floatingRef}
            style={dropdownStyle}
            className={`dropdown-surface ${className ?? ""}`}
            data-smart-dropdown-floating
            {...getFloatingProps()}
          >
            {children}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}

export default SmartDropdown;
