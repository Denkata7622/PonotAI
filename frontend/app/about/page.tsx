import type { Metadata } from "next";
import AboutPageClient from "./PageClient";

export const metadata: Metadata = {
  title: "About — Trackly",
  description: "Learn what Trackly is and how it identifies music across multiple providers.",
};

export default function AboutPage() {
  return <AboutPageClient />;
}
