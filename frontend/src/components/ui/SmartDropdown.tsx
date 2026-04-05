'use client';

import {
  useRef,
  useEffect,
  useState,
  ReactNode,
  CSSProperties,
} from 'react';
import ReactDOM from 'react-dom';
import { useSmartPosition } from '@/src/hooks/useSmartPosition';

interface SmartDropdownProps {
  trigger: ReactNode;
  children: ReactNode;
  isOpen: boolean;
  onClose: () => void;
  preferredSide?: 'bottom' | 'top';
  preferredPosition?: 'bottom' | 'top';
  minWidth?: number;
  width?: number | 'anchor';
  className?: string;
}

export function SmartDropdown({
  trigger,
  children,
  isOpen,
  onClose,
  preferredSide = 'bottom',
  preferredPosition,
  minWidth,
  width,
  className,
}: SmartDropdownProps) {
  /*
   * ALL hooks at top level — no exceptions.
   */

  // mounted guard — prevents portal from rendering during SSR
  // This is what fixes React error #418
  const [mounted, setMounted] = useState(false);

  const anchorRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const resolvedSide = preferredPosition ?? preferredSide;

  const positionStyle = useSmartPosition({
    anchorRef: anchorRef as React.RefObject<HTMLElement>,
    contentRef: contentRef as React.RefObject<HTMLElement>,
    isOpen: isOpen && mounted,
    preferredSide: resolvedSide,
    offset: 8,
    boundaryPadding: 12,
  });

  // Set mounted=true after first client render
  // This is the fix for hydration mismatch #418
  useEffect(() => {
    setMounted(true);
  }, []);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  const dropdownStyle: CSSProperties = {
    ...positionStyle,
    minWidth: width === 'anchor'
      ? (anchorRef.current?.offsetWidth ?? 160)
      : (width ?? minWidth ?? anchorRef.current?.offsetWidth ?? 160),
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.25)',
  };

  return (
    <>
      <div ref={anchorRef} style={{ display: 'contents' }}>
        {trigger}
      </div>

      {/*
       * Portal only mounts after client hydration (mounted === true).
       * Before that, nothing is rendered into document.body,
       * which matches the server-rendered HTML exactly.
       * This prevents React error #418.
       */}
      {mounted && isOpen && ReactDOM.createPortal(
        <>
          {/* Invisible backdrop — clicking it closes the dropdown */}
          <div
            aria-hidden="true"
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9998,
              background: 'transparent',
            }}
            onClick={onClose}
          />

          {/* Dropdown content */}
          <div
            ref={contentRef}
            role="menu"
            className={className}
            style={dropdownStyle}
          >
            {children}
          </div>
        </>,
        document.body
      )}
    </>
  );
}

export default SmartDropdown;
