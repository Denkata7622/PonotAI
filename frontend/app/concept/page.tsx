import type { Metadata } from "next";
import ConceptPageClient from "./PageClient";

export const metadata: Metadata = {
  title: "Concept — Turrex",
  description: "Explore the core concept and product vision behind Turrex.",
};

export default function ConceptPage() {
  return <ConceptPageClient />;
}
