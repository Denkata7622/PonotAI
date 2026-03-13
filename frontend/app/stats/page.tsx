import type { Metadata } from "next";
import StatsPageClient from "./PageClient";

export const metadata: Metadata = {
  title: "Stats — Trackly",
  description: "View global Trackly recognition totals and top artists.",
};

export default function StatsPage() {
  return <StatsPageClient />;
}
