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
            __html: `(function(){try{var theme=localStorage.getItem("ponotai-theme");document.documentElement.setAttribute("data-theme",theme||"dark");}catch(_){document.documentElement.setAttribute("data-theme","dark");}})();`,
          }}
        />
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
