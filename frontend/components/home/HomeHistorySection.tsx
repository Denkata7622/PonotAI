"use client";

import HistoryGrid from "../HistoryGrid";
import type { SongMatch } from "../../features/recognition/api";

type HistoryEntry = { id: string; source: "audio" | "ocr"; createdAt: string; song: SongMatch };

export default function HomeHistorySection({
  language,
  items,
  onDelete,
  onPlay,
}: {
  language: "en" | "bg";
  items: HistoryEntry[];
  onDelete: (id: string) => void;
  onPlay: (song: SongMatch) => void;
}) {
  return <HistoryGrid language={language} items={items} onDelete={onDelete} onPlay={onPlay} />;
}
