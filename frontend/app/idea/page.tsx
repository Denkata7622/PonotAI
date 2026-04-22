import type { Metadata } from "next";
import IdeaPageClient from "./PageClient";

export const metadata: Metadata = {
  title: "Idea — Turrex",
  description: "Read the original idea and goals that shaped the Turrex experience.",
};

export default function IdeaPage() {
  return <IdeaPageClient />;
}
