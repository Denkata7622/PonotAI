import type { Metadata } from "next";
import ThemeStudioPage from "../../src/screens/ThemeStudioPage";

export const metadata: Metadata = {
  title: "Theme Studio — Trackly",
  description: "Preview and apply Trackly theme configurations with safe temporary sessions.",
};

export default function ThemeStudio() {
  return <ThemeStudioPage />;
}
