import type { HTMLAttributes, PropsWithChildren } from "react";

export function Card({ children, className = "", ...props }: PropsWithChildren<HTMLAttributes<HTMLElement>>) {
  return (
    <section className={`bg-[var(--card-surface,var(--surface))] border border-[var(--card-border,var(--border))] rounded-[var(--radius-lg)] p-[var(--density-card-padding)] shadow-[var(--shadow-raised)] hover:border-[var(--accent-border)] hover:bg-[var(--surface-elevated)] transition-[border-color,box-shadow,background-color] duration-[var(--motion-base)] ${className}`} {...props}>
      {children}
    </section>
  );
}
