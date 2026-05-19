import type { Metadata } from "next";
import PersonalizationPage from "../../src/screens/PersonalizationPage";

export const metadata: Metadata = {
  title: "Personalization | Turrex",
  description: "Shape your Turrex identity, theme direction, music packs, and recommendation controls.",
};

export default function Personalization() {
  return <PersonalizationPage />;
}
