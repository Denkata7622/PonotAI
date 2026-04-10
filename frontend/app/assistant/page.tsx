'use client';

import { useEffect, useState } from "react";
import MusicAssistantPage from "@/src/features/assistant/components/MusicAssistantPage";

export default function AssistantPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div style={{ minHeight: "100vh", background: "var(--bg)" }} />;
  }

  return <MusicAssistantPage />;
}
