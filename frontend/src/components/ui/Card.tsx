import type { HTMLAttributes, PropsWithChildren } from "react";

export function Card({ children, className = "", ...props }: PropsWithChildren<HTMLAttributes<HTMLElement>>) {
  return (
    <section className={`bg-[var(--surface)] border border-border rounded-[var(--radius-lg)] p-[var(--density-card-padding)] shadow-[0_10px_26px_rgba(0,0,0,0.2)] hover:border-[var(--accent-border)] transition-[border-color,box-shadow] duration-[var(--motion-base)] ${className}`} {...props}>
      {children}
    </section>
  );
}
