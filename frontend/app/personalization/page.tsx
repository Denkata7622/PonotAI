import type { Metadata } from "next";
import PersonalizationPage from "../../src/screens/PersonalizationPage";

export const metadata: Metadata = {
  title: "Personalization | Turrex",
  description: "Shape your Turrex identity, theme direction, music packs, and recommendation controls.",
};

export default function Personalization() {
  return (
    <>
      <CompactSpacingPreference />
      <PersonalizationPage />
    </>
  );
}

function CompactSpacingPreference() {
  const script = `
(() => {
  const key = "turrex-compact-spacing";
  const root = document.documentElement;
  const checkbox = document.getElementById("turrex-compact-spacing-toggle");
  const apply = (enabled) => {
    if (enabled) root.setAttribute("data-compact", "true");
    else root.removeAttribute("data-compact");
    if (checkbox) checkbox.checked = enabled;
  };
  apply(window.localStorage.getItem(key) === "true");
  checkbox?.addEventListener("change", (event) => {
    const enabled = Boolean(event.target?.checked);
    if (enabled) window.localStorage.setItem(key, "true");
    else window.localStorage.removeItem(key);
    apply(enabled);
  });
})();
`;
  return (
    <section className="mx-auto mb-3 max-w-7xl px-4 pt-3 sm:px-6 lg:px-8">
      <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3 text-sm text-[var(--text)]">
        <label className="flex items-start justify-between gap-3">
          <span>
            <span className="block font-medium">Compact spacing (reduce container padding)</span>
            <span className="block text-xs leading-5 text-[var(--muted)]">Stores a local preference and applies compact main-content spacing on this device.</span>
          </span>
          <input id="turrex-compact-spacing-toggle" type="checkbox" role="switch" className="peer sr-only" />
          <span className="relative mt-0.5 h-6 w-11 shrink-0 rounded-full border border-[var(--border)] bg-[var(--surface)] transition before:absolute before:top-1/2 before:h-4 before:w-4 before:translate-x-1 before:-translate-y-1/2 before:rounded-full before:bg-[var(--muted)] before:transition-transform peer-checked:border-[var(--accent-border)] peer-checked:bg-[var(--accent)] peer-checked:before:translate-x-5 peer-checked:before:bg-[var(--accent-foreground)]" />
        </label>
      </div>
      <script dangerouslySetInnerHTML={{ __html: script }} />
    </section>
  );
}
