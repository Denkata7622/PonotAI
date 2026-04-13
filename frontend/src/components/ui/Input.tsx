import type { InputHTMLAttributes } from "react";

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full bg-[var(--input-bg)] border border-border text-text-primary placeholder:text-text-muted rounded-[var(--radius-sm)] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--accent-ring)] focus:border-[var(--accent-border)] transition-all duration-[var(--motion-fast)] ${className}`}
      {...props}
    />
  );
}
