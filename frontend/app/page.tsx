import type { Metadata } from "next";
import { HomeContent } from "../components/HomeContent";

export const metadata: Metadata = {
  title: "Home — Trackly",
  description: "Recognize songs instantly from live audio or image uploads in Trackly.",
};

export default function Page() {
  return <HomeContent />;
}
