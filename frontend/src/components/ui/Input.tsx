import type { InputHTMLAttributes } from "react";

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full bg-surface border border-border text-text-primary placeholder:text-text-muted rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--accent-ring)] focus:border-transparent transition-all duration-200 ${className}`}
      {...props}
    />
  );
}
