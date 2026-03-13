import type { Metadata } from "next";
import TheFuturePageClient from "./PageClient";

export const metadata: Metadata = {
  title: "The Future — Trackly",
  description: "See the Trackly roadmap and future platform direction.",
};

export default function TheFuturePage() {
  return <TheFuturePageClient />;
}
