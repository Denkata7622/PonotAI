'use client';

import {
  ReactNode,
  CSSProperties,
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
  placement?: Placement;       // default: 'bottom-start'
  minWidth?: number;
  matchTriggerWidth?: boolean; // dropdown same width as trigger
  className?: string;
  bottomPadding?: number;
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
}: SmartDropdownProps) {
  const playerBarPadding = typeof window === 'undefined'
    ? 0
    : Number.parseInt(window.getComputedStyle(document.documentElement).getPropertyValue('--player-bar-height') || '0', 10) || 0;
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
    // autoUpdate repositions on scroll, resize, and DOM changes
    whileElementsMounted: autoUpdate,
    middleware: [
      // Gap between trigger and dropdown
      offset(6),
      // Flip to opposite side if not enough space
      flip({
        fallbackAxisSideDirection: 'start',
        padding: viewportPadding,
      }),
      // Shift along the axis to stay in viewport
      shift({ padding: viewportPadding }),
      // Optionally match trigger width or enforce minWidth
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

  // floating-ui interaction hooks
  const click = useClick(context);
  const dismiss = useDismiss(context, {
    outsidePressEvent: 'mousedown',
  });

  const { getReferenceProps, getFloatingProps } = useInteractions([
    click,
    dismiss,
  ]);

  const dropdownStyle: CSSProperties = {
    ...floatingStyles,
    zIndex: 9999,
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.25)',
    overflowY: 'auto',
    maxHeight: '80vh',
  };

  return (
    <>
      <div
        ref={refs.setReference}
        {...getReferenceProps()}
        style={{ display: matchTriggerWidth ? 'block' : 'inline-block', width: matchTriggerWidth ? '100%' : 'auto' }}
      >
        {trigger}
      </div>

      {isOpen && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={dropdownStyle}
            className={className}
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
