'use client';

import type { ReactNode } from "react";
import AppShell from "./AppShell";
import { LanguageProvider } from "../lib/LanguageContext";
import { ThemeProvider } from "../lib/ThemeContext";
import { ProfileProvider } from "../lib/ProfileContext";
import { UserProvider } from "../src/context/UserContext";
import AssistantFAB from "../src/components/AssistantFAB";

export default function ClientLayout({ children }: { children: ReactNode }) {
  return (
    <UserProvider>
      <ThemeProvider>
        <LanguageProvider>
          <ProfileProvider>
            <AppShell><div className="pageTransition">{children}</div></AppShell>
            <AssistantFAB />
          </ProfileProvider>
        </LanguageProvider>
      </ThemeProvider>
    </UserProvider>
  );
}
