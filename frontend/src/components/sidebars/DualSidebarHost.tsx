'use client';

import { ListMusic, Sparkles } from 'lucide-react';
import { useEffect } from 'react';
import QueuePanelContent from '@/src/components/player/QueuePanel';
import MusicAssistantPage from '@/src/features/assistant/components/MusicAssistantPage';
import SidebarShell from './SidebarShell';
import { useDualSidebar } from './DualSidebarContext';

export default function DualSidebarHost() {
  const { state, closeActive, closePanel } = useDualSidebar();
  const anyOpen = state.open.assistant || state.open.queue;

  useEffect(() => {
    if (!anyOpen) return;
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeActive();
      }
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [anyOpen, closeActive]);

  const bothOpen = state.open.assistant && state.open.queue;

  return (
    <>
      {anyOpen ? <button aria-label="Close active sidebar" className="fixed inset-0 z-[44] bg-black/35" onClick={closeActive} /> : null}
      <SidebarShell
        id="assistant"
        title="AI Assistant"
        icon={<Sparkles className="h-4 w-4" />}
        side={state.side.assistant}
        open={state.open.assistant}
        active={state.active === 'assistant'}
        stacked={bothOpen && state.active !== 'assistant'}
        onClose={() => closePanel('assistant')}
      >
        <MusicAssistantPage mode="sidebar" />
      </SidebarShell>
      <SidebarShell
        id="queue"
        title="Up Next"
        icon={<ListMusic className="h-4 w-4" />}
        side={state.side.queue}
        open={state.open.queue}
        active={state.active === 'queue'}
        stacked={bothOpen && state.active !== 'queue'}
        onClose={() => closePanel('queue')}
      >
        <QueuePanelContent />
      </SidebarShell>
    </>
  );
}
