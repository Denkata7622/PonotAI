# Personalization coverage audit (Trackly UI)

## Audit scope
Reviewed theme/token wiring for core shared primitives and major app surfaces:

- Global tokens and data-attribute personalization hooks (`globals.css`, `ThemeContext`, app layout bootstrap)
- Shared primitives (`Button`, `Card`, `Badge`, `Input`, `Textarea`, `Modal`, `SmartDropdown`)
- App shell and sidebars (`AppShell`, dual sidebar host/shell, queue panel, bottom player bar)
- Assistant surfaces (`ActionCard`, prompts, queue and action highlights)
- Data/product pages (Search, Library, Stats, Admin, Settings)
- Reusable cards (playlist, result, row/list-card style components)

## Coverage status by category

| Category | Coverage | Findings |
|---|---|---|
| Buttons | Partial | Shared `Button` mostly tokenized; danger/focus ring path still hardcoded in places and many local buttons bypass primitive. |
| Cards | Partial | Shared `Card` tokenized, but many page-level cards use one-off borders/backgrounds and mixed status colors. |
| Badges/chips | Partial | Accent badge tokenized; semantic badges rely on static Tailwind color utilities instead of semantic tokens. |
| Tabs/nav pills | Partial | Active states often use `--active-bg`, but hover/focus/selected styles vary by page and some miss accent border token. |
| Sidebar/nav rows | Good/Partial | Core nav classes use tokens; some panel controls still rely on plain hover surfaces without selected accent hierarchy. |
| Dropdowns/menus | Partial | Dropdown container tokenized; menu item selected/hover states are not consistently accent-aware. |
| Modals/drawers | Partial | Modal uses inline style with fixed rgba/shadow/radius; bypasses central modal tokens. |
| Inputs/textarea/select | Partial | Input mostly tokenized; textarea uses raw utility aliases and fixed duration/radius. Select controls inconsistent by page. |
| Toggles/switches/checkbox/radio | Partial | Multiple ad hoc implementations; selected/focus state not consistently token-driven. |
| List rows/search cards/queue rows | Partial | Base surfaces tokenized, but selected rows and danger actions still contain hardcoded red/violet classes. |
| Charts/chart wrappers | Partial | Chart primary fill reads token; style modes exist but chart shell/tooltips and secondary palettes inconsistent. |
| Empty states/callouts | Partial | Many use tokenized surface, but status/callout accents are inconsistent across pages. |
| Settings controls | Good/Partial | Broad control set exists (intensity/surface/radius/chart/sidebar/motion), but section hierarchy and previews can be stronger. |

## Hardcoded/bypass hotspots identified

1. Shared primitive status colors (`Badge`, `Button danger`) are using hardcoded utility colors.
2. `Modal` and `SmartDropdown` rely on inline style constants for overlay/shadow/radius fallbacks.
3. Page components with one-off brand/status colors:
   - `SongReviewModal`, `PlaylistCard`, `PlaylistDetail`, `ResultCard`, `HomeContent` toast states.
4. Legacy semantic classes and assistant status colors in `globals.css` use fixed hex values.
5. Minor inline style usage bypassing token classes in settings previews and card emphasis sections.

## Prioritized remediation plan

1. Normalize shared primitives first (button/card/badge/input/textarea/modal/dropdown).
2. Introduce/extend semantic status tokens (`success`, `warning`, `danger`, `info`) in global CSS.
3. Replace high-traffic reusable card/list hardcoded colors with semantic token classes.
4. Tighten selected/focus/hover hierarchy for nav, tabs, rows, dropdown items, and queue/assistant states.
5. Expand token usage in chart wrappers, callout panels, and settings previews.
6. Re-audit all major surfaces after refactor and add tests for token generation/persistence paths.
