'use client';

import { useEffect, useState } from "react";
import { BarChart2, Library, Mic2, Music, Settings, Sparkles, Zap } from "lucide-react";

type Props = { onSelect: (prompt: string) => void; seedKey?: string };

type PromptItem = { text: string; Icon: typeof Sparkles };

const PROMPT_POOL: PromptItem[] = [
  { text: "Make me a gym playlist from my favorites", Icon: Zap },
  { text: "What genre did I play most today?", Icon: BarChart2 },
  { text: "What genre did I listen to most this week?", Icon: BarChart2 },
  { text: "Summarize my month in music in 5 bullets", Icon: BarChart2 },
  { text: "Build a chill focus playlist for 90 minutes", Icon: Music },
  { text: "Recommend artists similar to my saved songs", Icon: Sparkles },
  { text: "Surprise me with something outside my usual taste", Icon: Sparkles },
  { text: "Create a mellow night queue from my history", Icon: Music },
  { text: "Find songs I haven't played in a while", Icon: Library },
  { text: "Turn my recent plays into a road trip playlist", Icon: Sparkles },
  { text: "Which artists are trending up for me lately?", Icon: BarChart2 },
  { text: "What time of day do I listen most?", Icon: BarChart2 },
  { text: "Give me discovery picks based on my top genres", Icon: Sparkles },
  { text: "Help me organize my library into smart playlists", Icon: Library },
  { text: "Create a throwback mix from my nostalgic tracks", Icon: Sparkles },
  { text: "Build a no-skip queue for working out", Icon: Zap },
  { text: "Make a rainy-day ambient playlist", Icon: Music },
  { text: "Show my listening streak and how to keep it going", Icon: BarChart2 },
  { text: "Give me 10 songs for a productive study session", Icon: Mic2 },
  { text: "Suggest a lighter accent theme for daytime listening", Icon: Settings },
  { text: "Suggest a darker accent theme for night listening", Icon: Settings },
  { text: "Recommend one of these theme templates: Night Drive, Ocean Pulse, Sunset Glow, Forest Focus, Neon Violet", Icon: Settings },
  { text: "Create a playlist from my top artists this month", Icon: Music },
  { text: "What changed in my taste compared to last week?", Icon: BarChart2 },
  { text: "Queue up energetic tracks for a 30-minute run", Icon: Zap },
];

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function selectPrompts(seed: string): PromptItem[] {
  const picked = new Set<number>();
  const result: PromptItem[] = [];
  let cursor = hashString(seed) % PROMPT_POOL.length;

  while (result.length < 4 && picked.size < PROMPT_POOL.length) {
    if (!picked.has(cursor)) {
      picked.add(cursor);
      result.push(PROMPT_POOL[cursor]);
    }
    cursor = (cursor + 7) % PROMPT_POOL.length;
  }
  return result;
}

export default function StarterPrompts({ onSelect, seedKey = "default" }: Props) {
  const [visiblePrompts, setVisiblePrompts] = useState<PromptItem[]>(PROMPT_POOL.slice(0, 4));

  useEffect(() => {
    const sessionSeed = `${seedKey}-${new Date().toISOString().slice(0, 10)}`;
    setVisiblePrompts(selectPrompts(sessionSeed));
  }, [seedKey]);

  return (
    <div className="assistant-starter-prompts">
      {visiblePrompts.map(({ text, Icon }) => (
        <button key={text} type="button" className="assistant-chip" onClick={() => onSelect(text)}>
          <Icon width={14} height={14} strokeWidth={1.8} /> {text}
        </button>
      ))}
    </div>
  );
}
