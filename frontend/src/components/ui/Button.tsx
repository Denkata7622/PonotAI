import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

type Props = PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--accent)] text-[var(--accent-foreground)] hover:bg-[var(--accent-2)] focus:ring-2 focus:ring-[var(--accent-ring)] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-[var(--motion-base)] rounded-[var(--radius-sm)] font-medium select-none shadow-[0_6px_18px_rgba(var(--accent-rgb),0.28)]",
  secondary:
    "bg-[var(--surface-subtle)] border border-border text-text-primary hover:bg-[var(--accent-soft)] hover:border-[var(--accent-border)] focus:ring-2 focus:ring-[var(--accent-ring)] transition-all duration-[var(--motion-base)] rounded-[var(--radius-sm)] font-medium select-none",
  danger:
    "bg-[var(--status-danger)] text-[var(--accent-foreground)] hover:opacity-90 focus:ring-2 focus:ring-[color:rgba(var(--status-danger-rgb),0.35)] transition-all duration-[var(--motion-base)] rounded-[var(--radius-sm)] font-medium select-none",
  ghost: "text-text-muted hover:text-text-primary hover:bg-[var(--accent-soft)] transition-all duration-[var(--motion-base)] rounded-[var(--radius-sm)] select-none",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-3 text-base",
};

export function Button({ variant = "secondary", size = "md", className = "", children, ...props }: Props) {
  return (
    <button className={`${variantClasses[variant]} ${sizeClasses[size]} ${className}`} {...props}>
      {children}
    </button>
  );
}
