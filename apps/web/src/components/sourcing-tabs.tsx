import Link from "next/link";

const TABS = [
  { id: "vivier", href: "/recruteur/sourcing", label: "Vivier" },
  { id: "imports", href: "/recruteur/imports", label: "Mes imports" },
] as const;

/** Two entries of the same area: the opt-in talent pool, and the profiles this company imported itself. */
export function SourcingTabs({ active }: { active: "vivier" | "imports" }) {
  return (
    <nav aria-label="Sourcing" className="mb-5 inline-flex rounded-full border border-line bg-white p-1">
      {TABS.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href}
          aria-current={tab.id === active ? "page" : undefined}
          className={`rounded-full px-5 py-1.5 text-sm font-semibold transition ${
            tab.id === active ? "bg-forest text-white" : "text-sage hover:text-ink"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
