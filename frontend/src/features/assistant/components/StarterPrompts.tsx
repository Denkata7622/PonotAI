'use client';

import { BarChart2, Mic2, Music, Zap } from "lucide-react";

type Props = { onSelect: (prompt: string) => void };

const PROMPTS = [
  { text: "What do I listen to most?", Icon: BarChart2 },
  { text: "Recommend songs like my favorites", Icon: Music },
  { text: "Build me a workout queue", Icon: Zap },
  { text: "Summarize my music taste", Icon: Mic2 },
];

export default function StarterPrompts({ onSelect }: Props) {
  return (
    <div className="assistant-starter-prompts">
      {PROMPTS.map(({ text, Icon }) => (
        <button key={text} type="button" className="assistant-chip" onClick={() => onSelect(text)}>
          <Icon width={14} height={14} strokeWidth={1.8} /> {text}
        </button>
      ))}
    </div>
  );
}
