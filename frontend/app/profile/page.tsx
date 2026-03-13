import type { Metadata } from "next";
import ProfilePage from "../../src/screens/ProfilePage";

export const metadata: Metadata = {
  title: "Profile — Trackly",
  description: "Manage your Trackly profile, listening history, and favorites.",
};

export default function Profile() {
  return <ProfilePage />;
}
