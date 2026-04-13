import type { PropsWithChildren } from "react";

type BadgeVariant = "success" | "warning" | "danger" | "accent";

const variants: Record<BadgeVariant, string> = {
  success: "status-surface-success status-success",
  warning: "status-surface-warning status-warning",
  danger: "status-surface-danger status-danger",
  accent: "bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent-border)]",
};

export function Badge({ children, variant }: PropsWithChildren<{ variant: BadgeVariant }>) {
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${variants[variant]}`}>{children}</span>;
}
