import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

type Props = PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--accent)] text-[var(--accent-foreground)] hover:bg-[var(--accent-2)] focus:ring-2 focus:ring-[var(--accent-ring)] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 rounded-lg font-medium select-none",
  secondary:
    "bg-surface border border-border text-text-primary hover:bg-[var(--accent-soft)] focus:ring-2 focus:ring-[var(--accent-ring)] transition-all duration-200 rounded-lg font-medium select-none",
  danger:
    "bg-danger text-text-inverse hover:opacity-90 focus:ring-2 focus:ring-red-300 transition-all duration-200 rounded-lg font-medium select-none",
  ghost: "text-text-muted hover:text-text-primary hover:bg-surface-raised transition-all duration-200 rounded-lg select-none",
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
