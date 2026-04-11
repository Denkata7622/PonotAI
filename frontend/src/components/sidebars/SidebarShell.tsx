'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useDualSidebar, type SidebarPanelId } from './DualSidebarContext';

type Props = {
  id: SidebarPanelId;
  title: string;
  icon: ReactNode;
  active: boolean;
  open: boolean;
  stacked: boolean;
  onClose: () => void;
  children: ReactNode;
};

const focusableSelector = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export default function SidebarShell({ id, title, icon, active, open, stacked, onClose, children }: Props) {
  const { setActive } = useDualSidebar();
  const panelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open || !active) return;
    const panel = panelRef.current;
    if (!panel) return;
    const first = panel.querySelector<HTMLElement>(focusableSelector);
    first?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const nodes = Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector));
      if (nodes.length === 0) return;
      const firstNode = nodes[0];
      const lastNode = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === firstNode) {
        event.preventDefault();
        lastNode.focus();
      } else if (!event.shiftKey && document.activeElement === lastNode) {
        event.preventDefault();
        firstNode.focus();
      }
    };

    panel.addEventListener('keydown', onKeyDown);
    return () => panel.removeEventListener('keydown', onKeyDown);
  }, [active, open]);

  const peekOffset = stacked ? 6 : 0;
  const translate = open ? 0 : 110;
  const stackedTranslate = -peekOffset;

  return (
    <aside
      ref={panelRef}
      role="dialog"
      aria-modal={active}
      aria-label={title}
      onMouseDown={() => open && setActive(id)}
      className="fixed top-0 z-[46] h-full w-full max-w-[390px] rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl backdrop-blur-xl"
      style={{
        bottom: 'var(--player-bar-height, 90px)',
        right: 0,
        transform: `translateX(${translate + (open ? stackedTranslate : 0)}%)`,
        transition: 'transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 200ms ease',
        opacity: open ? (active ? 1 : 0.92) : 0,
        pointerEvents: open ? (active ? 'auto' : 'none') : 'none',
        zIndex: active ? 47 : 45,
      }}
    >
      <div className="flex h-full flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <div className="flex items-center gap-2 font-semibold">{icon}{title}</div>
          <div className="flex items-center gap-1">
            <button aria-label="Close panel" onClick={onClose} className="rounded-md p-2 hover:bg-[var(--surface-2)]"><X className="h-4 w-4"/></button>
          </div>
        </header>
        <div className="min-h-0 flex-1">{children}</div>
      </div>
    </aside>
  );
}
