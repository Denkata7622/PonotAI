import type { Metadata } from "next";
import StatsPageClient from "./PageClient";

export const metadata: Metadata = {
  title: "Stats — Turrex",
  description: "View global Turrex recognition totals and top artists.",
};

export default function StatsPage() {
  return <StatsPageClient />;
}
