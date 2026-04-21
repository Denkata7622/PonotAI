import type { Metadata } from "next";
import PersonalizationPage from "../../src/screens/PersonalizationPage";

export const metadata: Metadata = {
  title: "Personalization — Trackly",
  description: "Shape your Trackly identity, theme direction, music packs, and recommendation controls.",
};

export default function Personalization() {
  return <PersonalizationPage />;
}
