import type { Metadata } from "next";
import ConceptPageClient from "./PageClient";

export const metadata: Metadata = {
  title: "Concept — Trackly",
  description: "Explore the core concept and product vision behind Trackly.",
};

export default function ConceptPage() {
  return <ConceptPageClient />;
}
