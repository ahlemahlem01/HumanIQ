import Link from "next/link";
import { SiteHeader } from "@/components/site-header";

const features = [
  {
    icon: "M5 19V10M12 19V5M19 19v-7",
    title: "Score ATS instantané",
    body: "Chaque CV est comparé à l'offre visée, avec les mots-clés manquants à ajouter.",
  },
  {
    icon: "M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14Zm5-2 4 4",
    title: "Matching sémantique",
    body: "Les profils sont classés par proximité de sens avec l'offre, pas seulement par mots-clés.",
  },
  {
    icon: "M4 6h4v12H4V6Zm6 0h4v8h-4V6Zm6 0h4v5h-4V6Z",
    title: "Pipeline Kanban",
    body: "Sourcing, présélection, entretien, test, offre : glissez les candidatures d'une étape à l'autre.",
  },
  {
    icon: "M5 6h14v9H8l-3 3V6Z",
    title: "Entretiens simulés",
    body: "Les candidats s'entraînent avec un recruteur virtuel et reçoivent un retour détaillé.",
  },
  {
    icon: "M12 6c4 0 7 1.3 7 3s-3 3-7 3-7-1.3-7-3 3-3 7-3Zm7 5c0 1.7-3 3-7 3s-7-1.3-7-3",
    title: "Benchmark salarial",
    body: "Une fourchette de salaire selon l'expérience, la technologie et la localisation.",
  },
  {
    icon: "M12 3 5 6v6c0 4 3 6.5 7 8 4-1.5 7-4 7-8V6l-7-3Z",
    title: "RGPD et INPDP",
    body: "Consentement, export, anonymisation et journal d'audit intégrés dès la conception.",
  },
];

const candidate = ["Profil visible ou anonyme", "Score ATS pour chaque offre", "Analyse des écarts de compétences", "Entraînement aux entretiens"];
const recruiter = ["Import PDF, Word et LinkedIn", "Kanban collaboratif", "QCM et tests de code intégrés", "Extension Chrome de sourcing"];

function Check() {
  return (
    <svg viewBox="0 0 24 24" className="mt-0.5 h-5 w-5 shrink-0 text-forest" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="m5 12.5 4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      <SiteHeader />
      <main>
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-line bg-paper">
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 md:grid-cols-[1.05fr_0.95fr] md:py-24">
            <div>
              <span className="inline-flex items-center gap-2 rounded-lg border border-forest/20 bg-white px-3 py-1 text-xs font-semibold text-forest">
                <span className="h-1.5 w-1.5 rounded-full bg-forest" />
                Recrutement augmenté par l&apos;IA
              </span>
              <h1 className="mt-5 text-4xl font-bold leading-[1.08] tracking-tight md:text-6xl">
                Recrutez les bons profils, <span className="text-forest">sans perdre de temps.</span>
              </h1>
              <p className="mt-5 max-w-lg text-lg leading-8 text-sage">
                Une plateforme où les recruteurs publient des offres et reçoivent des candidatures déjà
                classées par l&apos;IA, et où les candidats trouvent la mission qui leur correspond.
              </p>
              <form action="/offres" className="mt-8 flex max-w-xl gap-2 rounded-full border border-line bg-white p-1.5 shadow-lg shadow-forest/5">
                <input
                  name="q"
                  placeholder="Poste, compétence ou ville"
                  className="min-w-0 flex-1 rounded-full bg-transparent px-5 py-3 text-sm outline-none"
                />
                <button className="rounded-full bg-forest px-7 py-3 text-sm font-semibold text-white">
                  Rechercher
                </button>
              </form>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-sage">
                <span>Populaires :</span>
                {["TypeScript", "Flutter", "Design", "Recrutement"].map((tag) => (
                  <Link
                    key={tag}
                    href={`/offres?q=${tag}`}
                    className="rounded-lg border border-line bg-white px-3 py-1 text-xs font-medium text-ink hover:border-forest hover:text-forest"
                  >
                    {tag}
                  </Link>
                ))}
              </div>
            </div>

            {/* Product mockup */}
            <div className="relative">
              <div className="rounded-3xl border border-line bg-white p-5 shadow-2xl shadow-forest/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-forest text-sm font-semibold text-white">
                      LM
                    </span>
                    <div>
                      <p className="text-sm font-semibold">Leila Mansouri</p>
                      <p className="text-xs text-sage">Ingénieure fullstack · Tunis</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-tint px-3 py-1 text-xs font-bold text-forest">Match 86%</span>
                </div>
                <div className="mt-5 h-2 overflow-hidden rounded-full bg-paper">
                  <div className="h-full w-[86%] rounded-full bg-forest" />
                </div>
                <p className="mt-4 text-xs font-semibold uppercase tracking-widest text-sage">Compétences</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {["TypeScript", "NestJS", "PostgreSQL", "React"].map((skill) => (
                    <span key={skill} className="rounded-full bg-tint px-3 py-1 text-xs font-medium text-forest">
                      {skill}
                    </span>
                  ))}
                  <span className="rounded-full border border-dashed border-warn/60 px-3 py-1 text-xs font-medium text-warn">
                    Kubernetes manquant
                  </span>
                </div>
                <div className="mt-5 grid grid-cols-3 gap-2 text-center text-xs">
                  {[
                    ["Présélection", "12"],
                    ["Entretien", "4"],
                    ["Offre", "1"],
                  ].map(([label, count]) => (
                    <div key={label} className="rounded-xl bg-paper px-2 py-3">
                      <p className="text-lg font-bold text-ink">{count}</p>
                      <p className="text-sage">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="absolute -bottom-9 -left-8 hidden rounded-2xl border border-line bg-white px-4 py-3 shadow-xl shadow-forest/10 md:block">
                <p className="text-xs text-sage">Score ATS du CV</p>
                <p className="text-xl font-bold text-forest">92 / 100</p>
              </div>
            </div>
          </div>
        </section>

        {/* Audiences */}
        <section className="mx-auto max-w-6xl px-5 py-20">
          <div className="grid gap-5 md:grid-cols-2">
            <article className="rounded-3xl bg-paper p-8">
              <p className="text-xs font-bold uppercase tracking-widest text-forest">Candidats</p>
              <h2 className="mt-3 text-2xl font-semibold">Un copilote de carrière.</h2>
              <ul className="mt-5 space-y-3 text-[15px]">
                {candidate.map((item) => (
                  <li key={item} className="flex gap-3">
                    <Check />
                    {item}
                  </li>
                ))}
              </ul>
              <Link href="/register" className="mt-7 inline-block rounded-full bg-forest px-6 py-3 text-sm font-semibold text-white">
                Créer mon profil
              </Link>
            </article>
            <article className="rounded-3xl bg-[#0b1f4b] p-8 text-white">
              <p className="text-xs font-bold uppercase tracking-widest text-[#93b4ff]">Recruteurs</p>
              <h2 className="mt-3 text-2xl font-semibold">Un ATS qui trie à votre place.</h2>
              <ul className="mt-5 space-y-3 text-[15px] text-white/90">
                {recruiter.map((item) => (
                  <li key={item} className="flex gap-3">
                    <svg viewBox="0 0 24 24" className="mt-0.5 h-5 w-5 shrink-0 text-[#93b4ff]" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="m5 12.5 4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
              <Link href="/register" className="mt-7 inline-block rounded-full bg-white px-6 py-3 text-sm font-semibold text-[#0b1f4b]">
                Publier une offre
              </Link>
            </article>
          </div>
        </section>

        {/* Features */}
        <section className="border-y border-line bg-paper">
          <div className="mx-auto max-w-6xl px-5 py-20">
            <h2 className="max-w-xl text-3xl font-bold tracking-tight">Tout ce qu&apos;il faut, au même endroit.</h2>
            <p className="mt-3 max-w-xl text-sage">
              De la première recherche à la signature, chaque étape est outillée.
            </p>
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => (
                <article key={feature.title} className="rounded-2xl border border-line bg-white p-6 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-forest/5">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-tint text-forest">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d={feature.icon} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <h3 className="mt-4 text-lg">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-sage">{feature.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-6xl px-5 py-20">
          <div className="rounded-3xl bg-forest px-8 py-14 text-center text-white md:px-16">
            <h2 className="mx-auto max-w-2xl text-3xl font-bold tracking-tight md:text-4xl">
              Prêt à recruter autrement ?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-white/80">
              Créez un compte gratuit et publiez votre première offre en quelques minutes.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Link href="/register" className="rounded-full bg-white px-7 py-3 text-sm font-semibold text-ink">
                Commencer
              </Link>
              <Link href="/offres" className="rounded-full border border-white/40 px-7 py-3 text-sm font-semibold text-white hover:bg-white/10">
                Voir les offres
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-8 text-sm text-sage">
          <p className="font-semibold text-forest">HumanIQ</p>
          <p>© 2026 HumanIQ. Conforme RGPD et INPDP.</p>
          <nav className="flex gap-5">
            <Link href="/offres" className="hover:text-ink">Offres</Link>
            <Link href="/login" className="hover:text-ink">Connexion</Link>
            <Link href="/register" className="hover:text-ink">Inscription</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
