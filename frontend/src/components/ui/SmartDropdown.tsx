"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import useSmartPosition from "@/src/hooks/useSmartPosition";

type Direction = "bottom" | "top" | "left" | "right";

export interface SmartDropdownProps {
  trigger: ReactNode;
  children: ReactNode;
  isOpen: boolean;
  onClose: () => void;
  preferredPosition?: Direction;
  width?: number | "anchor";
  className?: string;
}

const TRANSFORM_ORIGIN: Record<Direction, string> = {
  bottom: "top center",
  top: "bottom center",
  left: "center right",
  right: "center left",
};

export default function SmartDropdown({
  trigger,
  children,
  isOpen,
  onClose,
  preferredPosition = "bottom",
  width,
  className = "",
}: SmartDropdownProps) {
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);

  const { style, actualPosition, maxHeight } = useSmartPosition({
    anchorRef,
    contentRef,
    preferredPosition,
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    function onMouseDown(event: MouseEvent) {
      const target = event.target as Node;
      if (anchorRef.current?.contains(target) || contentRef.current?.contains(target)) return;
      onClose();
    }

    function onScroll(event: Event) {
      const target = event.target as Node;
      if (contentRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onClose();
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [isOpen, onClose]);

  const dropdownWidth = useMemo(() => {
    if (width === "anchor") {
      return anchorRef.current?.offsetWidth;
    }
    return width;
  }, [width, isOpen]);

  return (
    <>
      <div ref={anchorRef}>{trigger}</div>
      {mounted && isOpen && createPortal(
        <div
          ref={contentRef}
          style={{
            ...style,
            width: dropdownWidth,
            overflowY: "auto",
            zIndex: 200,
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
            opacity: 1,
            transform: "scaleY(1)",
            transformOrigin: TRANSFORM_ORIGIN[actualPosition],
            animation: "smart-dropdown-in 120ms ease-out",
            maxHeight,
          }}
          className={className}
          data-smart-dropdown
          data-position={actualPosition}
        >
          {children}
        </div>,
        document.body,
      )}
      {mounted && (
        <style>
          {`@keyframes smart-dropdown-in {
              from { opacity: 0; transform: scaleY(0.95); }
              to { opacity: 1; transform: scaleY(1); }
            }
          `}
        </style>
      )}
    </>
  );
}
