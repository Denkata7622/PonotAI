# Theme personalization coverage audit

## Current themed surfaces (before this refactor)
- Accent already touched nav active state, listen button glow, selected rows, and some button states.
- Density only supported compact/comfortable and affected a limited subset of spacing.
- Assistant cards used separate class styling with incomplete token wiring.

## Gaps found
- Many shared controls relied on hardcoded tailwind shades instead of tokenized surfaces.
- Sidebar/queue/player active states were partially themed but inconsistent.
- Chart palette was mostly single-accent with no personalization style variants.
- Focus rings, dropdown container shape, badge variants, and subtle/elevated surfaces were not consistently token-driven.

## Surfaces targeted in this pass
- Buttons, cards, badges, links, tabs-like controls, nav states
- Sidebar and queue active rows
- Form controls, dropdowns, focus rings, sliders/progress inputs
- Assistant action cards and capability cards
- Empty state callouts and chart bars
