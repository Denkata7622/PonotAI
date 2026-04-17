'use client';

import { ListMusic, Sparkles } from 'lucide-react';
import { useEffect } from 'react';
import QueuePanelContent from '@/src/components/player/QueuePanel';
import MusicAssistantPage from '@/src/features/assistant/components/MusicAssistantPage';
import SidebarShell from './SidebarShell';
import { useDualSidebar } from './DualSidebarContext';
import { useLanguage } from '@/lib/LanguageContext';
import { t } from '@/lib/translations';

export default function DualSidebarHost() {
  const { state, closeActive, closePanel } = useDualSidebar();
  const { language } = useLanguage();
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
      {anyOpen ? <button aria-label={t('sidebar_close_active', language)} className="fixed inset-0 z-[44] bg-black/35" onClick={closeActive} /> : null}
      <SidebarShell
        id="assistant"
        title={t('nav_assistant', language)}
        icon={<Sparkles className="h-4 w-4" />}
        open={state.open.assistant}
        active={state.active === 'assistant'}
        stacked={bothOpen && state.active !== 'assistant'}
        onClose={() => closePanel('assistant')}
      >
        <MusicAssistantPage mode="sidebar" sidebarOpen={state.open.assistant} />
      </SidebarShell>
      <SidebarShell
        id="queue"
        title={t('sidebar_up_next', language)}
        icon={<ListMusic className="h-4 w-4" />}
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
