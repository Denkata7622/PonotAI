'use client';

import type { ReactNode } from "react";
import AppShell from "./AppShell";
import { LanguageProvider } from "../lib/LanguageContext";
import { ThemeProvider } from "../lib/ThemeContext";
import { ProfileProvider } from "../lib/ProfileContext";
import { UserProvider } from "../src/context/UserContext";
import AssistantFAB from "../src/components/AssistantFAB";
import { DualSidebarProvider } from "../src/components/sidebars/DualSidebarContext";
import OnboardingGate from "../src/components/OnboardingGate";

export default function ClientLayout({ children }: { children: ReactNode }) {
  return (
    <UserProvider>
      <ThemeProvider>
        <LanguageProvider>
          <ProfileProvider>
            <DualSidebarProvider>
              <OnboardingGate />
              <AppShell><div className="pageTransition">{children}</div></AppShell>
              <AssistantFAB />
            </DualSidebarProvider>
          </ProfileProvider>
        </LanguageProvider>
      </ThemeProvider>
    </UserProvider>
  );
}
