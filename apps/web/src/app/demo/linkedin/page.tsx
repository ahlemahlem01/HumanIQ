export default function DemoLinkedInPage() {
  return (
    <div className="min-h-screen bg-[#f3f2ef] text-[#1b1f23]">
      <div className="bg-[#0a66c2] px-5 py-3 text-sm text-white">
        Page démo HumanIQ — reproduisant un profil LinkedIn pour tester l&apos;extension Chrome, sans
        scraper le vrai réseau.
      </div>
      <article className="mx-auto mt-6 max-w-3xl overflow-hidden rounded-xl border border-black/10 bg-white shadow-sm">
        <div className="h-24 bg-gradient-to-r from-[#0a66c2] to-[#70b5f9]" />
        <div className="-mt-10 px-6 pb-6">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#0b1f4b] text-2xl text-white">
            CM
          </div>
          <h1 data-ng-name className="mt-3 text-2xl font-semibold">
            Camille Moreau
          </h1>
          <p data-ng-headline className="text-body-medium mt-1 text-[15px]">
            Staff Frontend Engineer · React · TypeScript · Design System · 9 ans d&apos;expérience
          </p>
          <p data-ng-location className="mt-1 text-sm text-black/60">
            Paris, France · Remote
          </p>
          <p className="mt-2 text-sm text-[#0a66c2]">500+ relations · HumanIQ Demo</p>
        </div>
      </article>

      <section className="mx-auto mt-4 max-w-3xl rounded-xl border border-black/10 bg-white p-6">
        <h2 className="text-lg font-semibold">Info</h2>
        <p data-ng-about className="mt-2 text-sm leading-6">
          J&apos;aide les équipes produit à livrer des interfaces accessibles et mesurables. Stack :
          TypeScript, React, Next.js, Node.js, NestJS, PostgreSQL, Docker. J&apos;ai mené le design
          system interne (Figma + tokens) et l&apos;accessibilité WCAG 2.1 AA sur une plateforme RH.
        </p>
      </section>

      <section data-ng-experience className="mx-auto mt-4 max-w-3xl rounded-xl border border-black/10 bg-white p-6">
        <h2 className="text-lg font-semibold">Expérience</h2>
        <ul className="mt-3 space-y-3 text-sm">
          <li>
            Staff Frontend Engineer · Atlas Tech · 2022 – aujourd&apos;hui · React, TypeScript,
            Next.js, Design System, accessibilité. Réduction de 34 % du temps de time-to-offer.
          </li>
          <li>
            Senior Software Engineer · Studio Nord · 2018 – 2022 · Node.js, NestJS, PostgreSQL,
            Docker. Mise en place CI/CD et tests Playwright.
          </li>
        </ul>
      </section>

      <section data-ng-skills className="mx-auto mt-4 mb-10 max-w-3xl rounded-xl border border-black/10 bg-white p-6">
        <h2 className="text-lg font-semibold">Compétences</h2>
        <ul className="mt-3 flex flex-wrap gap-2 text-sm">
          {["TypeScript", "React", "Next.js", "NestJS", "PostgreSQL", "Docker", "Figma", "Design System", "Accessibilité"].map(
            (skill) => (
              <li key={skill} className="rounded-full bg-[#e9e5dc] px-3 py-1">
                {skill}
              </li>
            ),
          )}
        </ul>
      </section>
    </div>
  );
}
