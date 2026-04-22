import type { Metadata } from "next";
import SearchPageClient from "./PageClient";

export const metadata: Metadata = {
  title: "Search — Turrex",
  description: "Search recognized songs and artists from your Turrex listening history.",
};

export default function SearchPage() {
  return <SearchPageClient />;
}
