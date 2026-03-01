import "./globals.css";
import type { ReactNode } from "react";
import AppShell from "../components/AppShell";
import { LanguageProvider } from "../lib/LanguageContext";
import { ThemeProvider } from "../lib/ThemeContext";
import { ProfileProvider } from "../lib/ProfileContext";
import { UserProvider } from "../src/context/UserContext";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="bg" data-theme="dark" suppressHydrationWarning>
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
