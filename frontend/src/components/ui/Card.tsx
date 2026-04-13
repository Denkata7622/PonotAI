import type { HTMLAttributes, PropsWithChildren } from "react";

type CardVariant = "surface" | "settings" | "feature" | "interactive-list" | "selectable";

type Props = PropsWithChildren<HTMLAttributes<HTMLElement>> & {
  variant?: CardVariant;
};

const variantClasses: Record<CardVariant, string> = {
  surface: "surface-card",
  settings: "settings-card",
  feature: "feature-card",
  "interactive-list": "interactive-list-card",
  selectable: "selectable-card",
};

export function Card({ children, className = "", variant = "surface", ...props }: Props) {
  return (
    <section className={`card-base ${variantClasses[variant]} ${className}`} {...props}>
      {children}
    </section>
  );
}
