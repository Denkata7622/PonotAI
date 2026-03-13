import type { Metadata } from "next";
import FoundersPageClient from "./PageClient";

export const metadata: Metadata = {
  title: "Founders — Trackly",
  description: "Meet the builders behind Trackly and their product mission.",
};

export default function FoundersPage() {
  return <FoundersPageClient />;
}
