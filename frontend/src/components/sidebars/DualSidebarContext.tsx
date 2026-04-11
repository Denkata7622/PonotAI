'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type SidebarPanelId = 'queue' | 'assistant';

type State = {
  open: Record<SidebarPanelId, boolean>;
  active: SidebarPanelId;
};

type Ctx = {
  state: State;
  openPanel: (panel: SidebarPanelId) => void;
  closePanel: (panel: SidebarPanelId) => void;
  togglePanel: (panel: SidebarPanelId) => void;
  closeActive: () => void;
  setActive: (panel: SidebarPanelId) => void;
};

const DualSidebarContext = createContext<Ctx | null>(null);

const initialState: State = {
  open: { queue: false, assistant: false },
  active: 'queue',
};

function shouldUseSinglePanelMode(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 1024px)").matches;
}

export function DualSidebarProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(initialState);

  const openPanel = useCallback((panel: SidebarPanelId) => {
    setState((prev) => {
      const compact = shouldUseSinglePanelMode();
      return {
        ...prev,
        open: compact ? { queue: false, assistant: false, [panel]: true } : { ...prev.open, [panel]: true },
        active: panel,
      };
    });
  }, []);

  const closePanel = useCallback((panel: SidebarPanelId) => {
    setState((prev) => {
      const nextOpen = { ...prev.open, [panel]: false };
      const fallback: SidebarPanelId = panel === 'assistant' ? 'queue' : 'assistant';
      return {
        ...prev,
        open: nextOpen,
        active: prev.active === panel ? (nextOpen[fallback] ? fallback : prev.active) : prev.active,
      };
    });
  }, []);

  const togglePanel = useCallback((panel: SidebarPanelId) => {
    setState((prev) => {
      const compact = shouldUseSinglePanelMode();
      const isOpen = prev.open[panel];
      const nextOpen = compact
        ? { queue: false, assistant: false, [panel]: !isOpen }
        : { ...prev.open, [panel]: !isOpen };
      return {
        ...prev,
        open: nextOpen,
        active: !isOpen ? panel : prev.active,
      };
    });
  }, []);

  const closeActive = useCallback(() => {
    setState((prev) => {
      if (!prev.open[prev.active]) return prev;
      const nextOpen = { ...prev.open, [prev.active]: false };
      const fallback: SidebarPanelId = prev.active === 'assistant' ? 'queue' : 'assistant';
      return { ...prev, open: nextOpen, active: nextOpen[fallback] ? fallback : prev.active };
    });
  }, []);

  const setActive = useCallback((panel: SidebarPanelId) => {
    setState((prev) => ({ ...prev, active: panel, open: { ...prev.open, [panel]: true } }));
  }, []);

  const value = useMemo(() => ({ state, openPanel, closePanel, togglePanel, closeActive, setActive }), [state, openPanel, closePanel, togglePanel, closeActive, setActive]);
  return <DualSidebarContext.Provider value={value}>{children}</DualSidebarContext.Provider>;
}

export function useDualSidebar() {
  const ctx = useContext(DualSidebarContext);
  if (!ctx) throw new Error('useDualSidebar must be used inside DualSidebarProvider');
  return ctx;
}
