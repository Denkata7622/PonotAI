import type { Metadata } from "next";
import SettingsPage from "../../src/screens/SettingsPage";

export const metadata: Metadata = {
  title: "Settings — Trackly",
  description: "Customize Trackly recognition behavior, language, and preferences.",
};

export default function Settings() {
  return <SettingsPage />;
}
