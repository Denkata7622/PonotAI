import type { Metadata } from "next";
import MusicAssistantPage from "@/src/features/assistant/components/MusicAssistantPage";

export const metadata: Metadata = {
  title: "Music Assistant — PonotAI",
};

export default function AssistantPage() {
  return <MusicAssistantPage />;
}
