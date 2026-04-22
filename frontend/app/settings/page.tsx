import type { Metadata } from "next";
import SettingsPage from "../../src/screens/SettingsPage";

export const metadata: Metadata = {
  title: "Settings — Turrex",
  description: "Customize Turrex recognition behavior, language, and preferences.",
};

export default function Settings() {
  return <SettingsPage />;
}
