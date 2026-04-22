import type { Metadata } from "next";
import FoundersPageClient from "./PageClient";

export const metadata: Metadata = {
  title: "Founders — Turrex",
  description: "Meet the builders behind Turrex and their product mission.",
};

export default function FoundersPage() {
  return <FoundersPageClient />;
}
