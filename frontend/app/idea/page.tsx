import type { Metadata } from "next";
import IdeaPageClient from "./PageClient";

export const metadata: Metadata = {
  title: "Idea — Trackly",
  description: "Read the original idea and goals that shaped the Trackly experience.",
};

export default function IdeaPage() {
  return <IdeaPageClient />;
}
