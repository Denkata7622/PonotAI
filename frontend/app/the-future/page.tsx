import type { Metadata } from "next";
import TheFuturePageClient from "./PageClient";

export const metadata: Metadata = {
  title: "The Future — Turrex",
  description: "See the Turrex roadmap and future platform direction.",
};

export default function TheFuturePage() {
  return <TheFuturePageClient />;
}
