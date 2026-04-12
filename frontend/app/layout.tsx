import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import ClientLayout from "../components/ClientLayout";
import { ACCENT_TOKENS, SUPPORTED_ACCENTS } from "../lib/themePresets";

export const metadata: Metadata = {
  title: {
    default: "PonotAI",
    template: "%s | PonotAI",
  },
  description: "Trackly (PonotAI) music recognition web app.",
  manifest: "/manifest.json",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const accentTokens = JSON.stringify(ACCENT_TOKENS);
  const supportedAccents = JSON.stringify(SUPPORTED_ACCENTS);
  return (
    <html lang="bg" data-theme="dark" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#7c5cff" />
      </head>
      <body className="text-[var(--text)]" suppressHydrationWarning>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var theme=localStorage.getItem("ponotai-theme")||"dark";var accent=localStorage.getItem("ponotai-accent")||"violet";var density=localStorage.getItem("ponotai-density")||"comfortable";var resolvedTheme=theme==="system"?(window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"):theme;var accents=${accentTokens};var supported=${supportedAccents};if(!supported.includes(accent)){accent="violet";localStorage.setItem("ponotai-accent","violet");}var token=accents[accent]||accents.violet;document.documentElement.setAttribute("data-theme",resolvedTheme);document.body.setAttribute("data-theme",resolvedTheme);document.documentElement.setAttribute("data-accent",accent);document.documentElement.setAttribute("data-density",density);document.documentElement.style.colorScheme=resolvedTheme;document.documentElement.style.setProperty("--accent",token.accent);document.documentElement.style.setProperty("--accent-rgb",token.accentRgb);document.documentElement.style.setProperty("--accent-2",token.accent2);document.documentElement.style.setProperty("--accent-foreground",token.accentForeground);document.documentElement.style.setProperty("--accent-soft","rgba("+token.accentRgb+", 0.18)");document.documentElement.style.setProperty("--accent-border","rgba("+token.accentRgb+", 0.5)");document.documentElement.style.setProperty("--accent-ring","rgba("+token.accentRgb+", 0.35)");document.documentElement.style.setProperty("--accent-hover","rgba("+token.accentRgb+", 0.24)");document.documentElement.style.setProperty("--accent-active-bg","rgba("+token.accentRgb+", 0.2)");document.documentElement.style.setProperty("--listen-glow","rgba("+token.accentRgb+", 0.55)");document.documentElement.style.setProperty("--listen-glow-soft","rgba("+token.accentRgb+", 0.18)");}catch(_){document.documentElement.setAttribute("data-theme","dark");}})();`,
          }}
        />
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
