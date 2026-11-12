import Link from "next/link";
import { Logo } from "@/components/logo";

const points = [
  "Candidatures classées automatiquement par l'IA",
  "Pipeline Kanban et tests techniques intégrés",
  "Profils visibles ou anonymes, selon votre choix",
];

export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-[1fr_1.1fr]">
      <aside className="relative hidden overflow-hidden bg-forest p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <Link href="/" className="relative flex items-center gap-3 text-xl font-bold">
          <Logo size={48} />
          HumanIQ
        </Link>
        <div className="relative">
          <h2 className="max-w-md text-4xl font-bold leading-tight tracking-tight">
            Le recrutement, version intelligente.
          </h2>
          <ul className="mt-8 space-y-4 text-white/85">
            {points.map((point) => (
              <li key={point} className="flex gap-3">
                <svg viewBox="0 0 24 24" className="mt-0.5 h-5 w-5 shrink-0 text-[#93b4ff]" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="m5 12.5 4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {point}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-[#93b4ff]">Conforme RGPD et INPDP</p>
      </aside>

      <main className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-md">
          <Link href="/" className="mb-8 flex items-center gap-2 text-lg font-bold text-forest lg:hidden">
            <Logo size={36} tile />
            HumanIQ
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          {subtitle ? <p className="mt-2 text-sm text-sage">{subtitle}</p> : null}
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}

export function TextField({
  name,
  label,
  type = "text",
}: {
  name: string;
  label: string;
  type?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block font-medium text-ink">{label}</span>
      <input
        required
        name={name}
        type={type}
        className="w-full rounded-xl border border-line bg-white px-4 py-3 outline-none transition focus:border-forest focus:ring-4 focus:ring-forest/10"
      />
    </label>
  );
}
