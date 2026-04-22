import type { Metadata } from "next";
import { HomeContent } from "../components/HomeContent";

export const metadata: Metadata = {
  title: "Home — Turrex",
  description: "Recognize songs instantly from live audio or image uploads in Turrex.",
};

export default function Page() {
  return <HomeContent />;
}
