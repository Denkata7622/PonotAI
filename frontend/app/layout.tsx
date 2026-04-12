import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import ClientLayout from "../components/ClientLayout";

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
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#7c5cff" />
      </head>
      <body className="text-[var(--text)]" suppressHydrationWarning>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var theme=localStorage.getItem("ponotai-theme")||"dark";var accent=localStorage.getItem("ponotai-accent")||"violet";var density=localStorage.getItem("ponotai-density")||"comfortable";var resolvedTheme=theme==="system"?(window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"):theme;var accents={violet:{a:"#7c5cff",r:"124, 92, 255",b:"#4cd3ff"},ocean:{a:"#0ea5e9",r:"14, 165, 233",b:"#2563eb"},sunset:{a:"#f97316",r:"249, 115, 22",b:"#ef4444"},emerald:{a:"#10b981",r:"16, 185, 129",b:"#06b6d4"},rose:{a:"#e11d48",r:"225, 29, 72",b:"#f59e0b"}};var token=accents[accent]||accents.violet;document.documentElement.setAttribute("data-theme",resolvedTheme);document.body.setAttribute("data-theme",resolvedTheme);document.documentElement.setAttribute("data-accent",accent);document.documentElement.setAttribute("data-density",density);document.documentElement.style.setProperty("--accent",token.a);document.documentElement.style.setProperty("--accent-rgb",token.r);document.documentElement.style.setProperty("--accent-2",token.b);}catch(_){document.documentElement.setAttribute("data-theme","dark");}})();`,
          }}
        />
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
