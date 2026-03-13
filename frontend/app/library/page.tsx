import type { Metadata } from "next";
import LibraryPageClient from "./PageClient";

export const metadata: Metadata = {
  title: "Library — Trackly",
  description: "Browse your Trackly history, favorites, and playlists in one place.",
};

export default function LibraryPage() {
  return <LibraryPageClient />;
}
