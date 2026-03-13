import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import AppShell from "../components/AppShell";
import { LanguageProvider } from "../lib/LanguageContext";
import { ThemeProvider } from "../lib/ThemeContext";
import { ProfileProvider } from "../lib/ProfileContext";
import { UserProvider } from "../src/context/UserContext";

export const metadata: Metadata = {
  title: {
    default: "PonotAI",
    template: "%s | PonotAI",
  },
  description: "Trackly (PonotAI) music recognition web app.",
  manifest: "/manifest.json",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="bg" data-theme="dark" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#7c5cff" />
      </head>
      <body className="text-[var(--text)]">
        <UserProvider>
          <ThemeProvider>
            <LanguageProvider>
              <ProfileProvider>
                <AppShell>{children}</AppShell>
              </ProfileProvider>
            </LanguageProvider>
          </ThemeProvider>
        </UserProvider>
      </body>
    </html>
  );
}
