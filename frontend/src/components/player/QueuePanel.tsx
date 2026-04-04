"use client";

import { ListMusic, Music, Trash2, Volume2, X } from "lucide-react";
import { useRef, useState } from "react";
import { usePlayer } from "@/components/PlayerProvider";

export default function QueuePanel() {
  const {
    queue,
    currentIndex,
    isQueueOpen,
    removeFromQueue,
    clearQueue,
    playFromQueue,
    reorderQueue,
    toggleQueuePanel,
  } = usePlayer();
  const dragIndex = useRef<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const bottomOffset = "150px";

  return (
    <aside
      className={`fixed right-0 z-[35] h-[calc(100vh-${bottomOffset})] w-full max-w-[360px] border-l border-[var(--border)] bg-[var(--surface)] shadow-2xl transition-transform duration-300 ease-out md:right-20 ${isQueueOpen ? "translate-x-0" : "translate-x-full"}`}
      style={{ bottom: bottomOffset }}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <div className="flex items-center gap-2">
            <ListMusic className="h-[18px] w-[18px]" />
            <h3 className="font-semibold">Up Next</h3>
            <span className="text-xs text-[var(--muted)]">({queue.length})</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={clearQueue} className="rounded-md p-2 hover:bg-[var(--surface-2)]" aria-label="Clear queue">
              <Trash2 className="h-4 w-4" />
            </button>
            <button onClick={toggleQueuePanel} className="rounded-md p-2 hover:bg-[var(--surface-2)]" aria-label="Close queue">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {queue.length === 0 ? (
          <div className="grid flex-1 place-items-center p-6 text-center">
            <div>
              <Music className="mx-auto h-8 w-8 text-[var(--muted)]" />
              <p className="mt-3 font-medium">Your queue is empty</p>
              <p className="text-sm text-[var(--muted)]">Add songs from playlists or search</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 space-y-1 overflow-y-auto p-2">
            {queue.map((entry, index) => (
              <button
                key={entry.queueId}
                draggable
                onDragStart={() => {
                  dragIndex.current = index;
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  setOverIndex(index);
                }}
                onDragEnd={() => {
                  if (dragIndex.current !== null && overIndex !== null && dragIndex.current !== overIndex) {
                    reorderQueue(dragIndex.current, overIndex);
                  }
                  dragIndex.current = null;
                  setOverIndex(null);
                }}
                onClick={() => playFromQueue(entry.queueId)}
                className={`group flex w-full items-center gap-2 rounded-xl border p-2 text-left ${index === currentIndex ? "border-[var(--accent)] border-l-4" : "border-[var(--border)]"} ${overIndex === index ? "bg-[var(--surface-2)]" : "bg-[var(--surface)]"}`}
              >
                <span className="w-5 text-xs text-[var(--muted)]">{index + 1}</span>
                {entry.track.artworkUrl ? <img src={entry.track.artworkUrl} alt="cover" className="h-9 w-9 rounded object-cover" /> : <div className="h-9 w-9 rounded bg-[var(--surface-2)]" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{entry.track.title}</p>
                  <p className="truncate text-xs text-[var(--muted)]">{entry.track.artist}</p>
                </div>
                {index === currentIndex ? <Volume2 className="h-[14px] w-[14px] text-[var(--accent)] animate-pulse" /> : null}
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    removeFromQueue(entry.queueId);
                  }}
                  className="opacity-0 transition group-hover:opacity-100"
                >
                  <X className="h-[14px] w-[14px]" />
                </button>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
