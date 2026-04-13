'use client';

import { Music, Trash2, Volume2, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { usePlayer } from '@/components/PlayerProvider';

export default function QueuePanel() {
  const { queue, currentIndex, removeFromQueue, clearQueue, playFromQueue, reorderQueue } = usePlayer();
  const dragIndex = useRef<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <span className="text-xs text-[var(--muted)]">{queue.length} tracks</span>
        <button onClick={clearQueue} className="rounded-[var(--radius-sm)] p-2 hover:bg-[var(--accent-soft)]" aria-label="Clear queue"><Trash2 className="h-4 w-4" /></button>
      </div>
      {queue.length === 0 ? (
        <div className="grid flex-1 place-items-center p-6 text-center"><div><Music className="mx-auto h-8 w-8 text-[var(--muted)]" /><p className="mt-3 font-medium">Your queue is empty</p></div></div>
      ) : (
        <div className="flex-1 space-y-1 overflow-y-auto p-2 pb-24">
          {queue.map((entry, index) => (
            <div
              key={entry.queueId}
              draggable
              role="button"
              tabIndex={0}
              onDragStart={() => { dragIndex.current = index; }}
              onDragOver={(event) => { event.preventDefault(); setOverIndex(index); }}
              onDragEnd={() => {
                if (dragIndex.current !== null && overIndex !== null && dragIndex.current !== overIndex) reorderQueue(dragIndex.current, overIndex);
                dragIndex.current = null;
                setOverIndex(null);
              }}
              onClick={() => playFromQueue(entry.queueId)}
              className={`group flex w-full items-center gap-2 rounded-[var(--radius-md)] border p-2 text-left transition-colors ${index === currentIndex ? 'themed-selected border-l-4 shadow-[0_0_0_1px_var(--accent-border)]' : 'border-[var(--border)] hover:border-[var(--accent-border)]'} ${overIndex === index ? 'bg-[var(--surface-2)]' : 'bg-[var(--surface-subtle)] hover:bg-[var(--hover-bg)]'}`}
            >
              <span className="w-5 text-xs text-[var(--muted)]">{index + 1}</span>
              {entry.track.artworkUrl ? <img src={entry.track.artworkUrl} alt="cover" className="h-9 w-9 rounded object-cover" /> : <div className="h-9 w-9 rounded bg-[var(--surface-2)]" />}
              <div className="min-w-0 flex-1"><p className="truncate text-sm">{entry.track.title}</p><p className="truncate text-xs text-[var(--muted)]">{entry.track.artist}</p></div>
              {index === currentIndex ? <Volume2 className="h-[14px] w-[14px] text-[var(--accent)] animate-pulse" /> : null}
              <button type="button" onClick={(event) => { event.stopPropagation(); removeFromQueue(entry.queueId); }} className="opacity-0 transition group-hover:opacity-100 rounded-[var(--radius-sm)] p-1 hover:bg-[var(--hover-bg)]"><X className="h-[14px] w-[14px]" /></button>
            </div>
          ))}
        </div>
      )}
      {queue.length > 0 ? (
        <div className="border-t border-[var(--border)] bg-[var(--surface)] px-3 py-2 pb-[calc(10px+env(safe-area-inset-bottom,0px))]">
          <button onClick={clearQueue} className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--accent-soft)] hover:border-[var(--accent-border)]">
            Clear queue
          </button>
        </div>
      ) : null}
    </div>
  );
}
