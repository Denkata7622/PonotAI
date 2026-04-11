'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type SidebarPanelId = 'queue' | 'assistant';
export type SidebarSide = 'left' | 'right';

type State = {
  open: Record<SidebarPanelId, boolean>;
  side: Record<SidebarPanelId, SidebarSide>;
  active: SidebarPanelId;
};

type Ctx = {
  state: State;
  openPanel: (panel: SidebarPanelId) => void;
  closePanel: (panel: SidebarPanelId) => void;
  togglePanel: (panel: SidebarPanelId) => void;
  closeActive: () => void;
  setActive: (panel: SidebarPanelId) => void;
  swapSides: () => void;
  movePanelToSide: (panel: SidebarPanelId, side: SidebarSide) => void;
};

const DualSidebarContext = createContext<Ctx | null>(null);

const initialState: State = {
  open: { queue: false, assistant: false },
  side: { queue: 'right', assistant: 'left' },
  active: 'queue',
};

export function DualSidebarProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(initialState);

  const openPanel = useCallback((panel: SidebarPanelId) => {
    setState((prev) => ({ ...prev, open: { ...prev.open, [panel]: true }, active: panel }));
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
      const isOpen = prev.open[panel];
      const nextOpen = { ...prev.open, [panel]: !isOpen };
      return {
        ...prev,
        open: nextOpen,
        active: !isOpen ? panel : prev.active,
      };
    });
  }, []);

  const closeActive = useCallback(() => {
    setState((prev) => {
      const current = prev.active;
      if (!prev.open[current]) return prev;
      const nextOpen = { ...prev.open, [current]: false };
      const fallback: SidebarPanelId = current === 'assistant' ? 'queue' : 'assistant';
      return {
        ...prev,
        open: nextOpen,
        active: nextOpen[fallback] ? fallback : current,
      };
    });
  }, []);

  const setActive = useCallback((panel: SidebarPanelId) => {
    setState((prev) => ({ ...prev, active: panel, open: { ...prev.open, [panel]: true } }));
  }, []);

  const movePanelToSide = useCallback((panel: SidebarPanelId, side: SidebarSide) => {
    setState((prev) => {
      const other: SidebarPanelId = panel === 'assistant' ? 'queue' : 'assistant';
      if (prev.side[panel] === side) return prev;
      return {
        ...prev,
        side: {
          ...prev.side,
          [panel]: side,
          [other]: side === 'left' ? 'right' : 'left',
        },
      };
    });
  }, []);

  const swapSides = useCallback(() => {
    setState((prev) => ({
      ...prev,
      side: {
        queue: prev.side.queue === 'left' ? 'right' : 'left',
        assistant: prev.side.assistant === 'left' ? 'right' : 'left',
      },
    }));
  }, []);

  const value = useMemo(() => ({ state, openPanel, closePanel, togglePanel, closeActive, setActive, swapSides, movePanelToSide }), [state, openPanel, closePanel, togglePanel, closeActive, setActive, swapSides, movePanelToSide]);

  return <DualSidebarContext.Provider value={value}>{children}</DualSidebarContext.Provider>;
}

export function useDualSidebar() {
  const ctx = useContext(DualSidebarContext);
  if (!ctx) throw new Error('useDualSidebar must be used inside DualSidebarProvider');
  return ctx;
}
