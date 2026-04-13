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
            __html: `(function(){try{var ls=localStorage;var theme=ls.getItem("ponotai-theme")||"dark";var accent=ls.getItem("ponotai-accent")||"violet";var density=ls.getItem("ponotai-density")||"default";var radius=ls.getItem("ponotai-radius")||"default";var surface=ls.getItem("ponotai-surface-style")||"soft";var sidebar=ls.getItem("ponotai-sidebar-style")||"standard";var motion=ls.getItem("ponotai-motion-level")||"full";var card=ls.getItem("ponotai-card-emphasis")||"standard";var font=ls.getItem("ponotai-font-family")||"inter";var textScale=ls.getItem("ponotai-text-scale")||"md";var chart=ls.getItem("ponotai-chart-style")||"accent-led";var intensity=ls.getItem("ponotai-intensity")||"balanced";var resolvedTheme=theme==="system"?(window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"):theme;var accents=${accentTokens};var supported=${supportedAccents};if(!supported.includes(accent)){accent="violet";ls.setItem("ponotai-accent","violet");}var token=accents[accent]||accents.violet;var i={subtle:{soft:.1,border:.3,ring:.26,hover:.15,active:.14},balanced:{soft:.18,border:.5,ring:.35,hover:.24,active:.2},vivid:{soft:.24,border:.66,ring:.48,hover:.34,active:.28}}[intensity]||{soft:.18,border:.5,ring:.35,hover:.24,active:.2};var chartTokens=chart==="neutral"?["#94a3b8","#64748b","#475569","#334155","#1e293b"]:chart==="multicolor"?[token.accent,token.accent2,"#22c55e","#f59e0b","#ef4444"]:[token.accent,token.accent2,"rgba("+token.accentRgb+", 0.75)","rgba("+token.accentRgb+", 0.58)","rgba("+token.accentRgb+", 0.42)"];var chartLabel=chart==="neutral"?"var(--muted)":"color-mix(in srgb, var(--text) 82%, "+chartTokens[0]+")";var html=document.documentElement;html.setAttribute("data-theme",resolvedTheme);document.body.setAttribute("data-theme",resolvedTheme);html.setAttribute("data-accent",accent);html.setAttribute("data-density",density);html.setAttribute("data-radius",radius);html.setAttribute("data-chart-style",chart);html.setAttribute("data-surface",surface);html.setAttribute("data-sidebar",sidebar);html.setAttribute("data-motion",motion);html.setAttribute("data-card-emphasis",card);html.setAttribute("data-font",font);html.setAttribute("data-text-scale",textScale);html.style.colorScheme=resolvedTheme;html.style.setProperty("--accent",token.accent);html.style.setProperty("--accent-rgb",token.accentRgb);html.style.setProperty("--accent-2",token.accent2);html.style.setProperty("--accent-foreground",token.accentForeground);html.style.setProperty("--accent-soft","rgba("+token.accentRgb+", "+i.soft+")");html.style.setProperty("--accent-border","rgba("+token.accentRgb+", "+i.border+")");html.style.setProperty("--accent-ring","rgba("+token.accentRgb+", "+i.ring+")");html.style.setProperty("--accent-hover","rgba("+token.accentRgb+", "+i.hover+")");html.style.setProperty("--accent-active-bg","rgba("+token.accentRgb+", "+i.active+")");html.style.setProperty("--listen-glow","rgba("+token.accentRgb+", 0.55)");html.style.setProperty("--listen-glow-soft","rgba("+token.accentRgb+", "+Math.max(0.14,i.soft)+")");html.style.setProperty("--chart-1",chartTokens[0]);html.style.setProperty("--chart-2",chartTokens[1]);html.style.setProperty("--chart-3",chartTokens[2]);html.style.setProperty("--chart-4",chartTokens[3]);html.style.setProperty("--chart-5",chartTokens[4]);html.style.setProperty("--chart-label",chartLabel);}catch(_){document.documentElement.setAttribute("data-theme","dark");}})();`,
          }}
        />
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
