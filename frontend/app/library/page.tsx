import type { Metadata } from "next";
import LibraryPageClient from "./PageClient";

export const metadata: Metadata = {
  title: "Library — Turrex",
  description: "Browse your Turrex history, favorites, and playlists in one place.",
};

export default function LibraryPage() {
  return <LibraryPageClient />;
}
