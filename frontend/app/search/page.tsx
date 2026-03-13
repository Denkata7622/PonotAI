import type { Metadata } from "next";
import SearchPageClient from "./PageClient";

export const metadata: Metadata = {
  title: "Search — Trackly",
  description: "Search recognized songs and artists from your Trackly listening history.",
};

export default function SearchPage() {
  return <SearchPageClient />;
}
