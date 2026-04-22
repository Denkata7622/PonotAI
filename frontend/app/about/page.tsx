import type { Metadata } from "next";
import AboutPageClient from "./PageClient";

export const metadata: Metadata = {
  title: "About — Turrex",
  description: "Learn what Turrex is and how it identifies music across multiple providers.",
};

export default function AboutPage() {
  return <AboutPageClient />;
}
