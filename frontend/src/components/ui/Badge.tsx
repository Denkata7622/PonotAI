import type { PropsWithChildren } from "react";

type BadgeVariant = "success" | "warning" | "danger" | "accent";

const variants: Record<BadgeVariant, string> = {
  success: "bg-green-500/15 text-green-300 border-green-500/30",
  warning: "bg-yellow-500/15 text-yellow-200 border-yellow-500/30",
  danger: "bg-red-500/15 text-red-200 border-red-500/30",
  accent: "bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent-border)]",
};

export function Badge({ children, variant }: PropsWithChildren<{ variant: BadgeVariant }>) {
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${variants[variant]}`}>{children}</span>;
}
