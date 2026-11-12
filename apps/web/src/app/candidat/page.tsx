"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card, EmptyState, Pill, primaryButton, ScoreRing, Skeleton } from "@/components/candidate-ui";
import { api, STAGE_LABEL } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Job = {
  id: string;
  title: string;
  location: string;
  remote: boolean;
  contractType: string;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string;
  requiredSkills: string[];
  createdAt: string;
  company: { name: string };
};

type Recommendation = { score?: number; semanticScore: number; job: { id: string } };
type Application = { id: string; stage: string; job: Job };
type Me = {
  headline: string | null;
  bio: string | null;
  location: string | null;
  skills: string[];
  experiences?: unknown[];
  educations?: unknown[];
};
type Test = { id: string; status: string };
type Interview = { id: string; status: string };

const CONTRACT_LABEL: Record<string, string> = { CDI: "CDI", CDD: "CDD", STAGE: "Stage", INTERNSHIP: "Stage", FREELANCE: "Freelance", ALTERNANCE: "Alternance" };

export default function CandidateHomePage() {
  const { token, user } = useAuth();
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [apps, setApps] = useState<Application[] | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [tests, setTests] = useState<Test[]>([]);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [unread, setUnread] = useState(0);
  const [saved, setSaved] = useState<string[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!token) return;
    api<Job[]>("/jobs", { token }).then(setJobs).catch(() => setJobs([]));
    api<Recommendation[]>("/ai/recommendations", { token })
      .then((rows) => setScores(Object.fromEntries(rows.map((row) => [row.job.id, row.score ?? row.semanticScore]))))
      .catch(() => setScores({}));
    api<Application[]>("/applications/mine", { token }).then(setApps).catch(() => setApps([]));
    api<Me>("/candidates/me", { token }).then(setMe).catch(() => undefined);
    api<Test[]>("/assessments/mine", { token }).then(setTests).catch(() => undefined);
    api<Interview[]>("/interviews", { token }).then(setInterviews).catch(() => undefined);
    api<{ count: number }>("/messages/unread", { token }).then((result) => setUnread(result.count)).catch(() => undefined);
  }, [token]);

  // Saved jobs live in the browser (same key as the Jobs page).
  useEffect(() => {
    if (!user) return;
    try {
      const raw = localStorage.getItem(`nextgen_saved_${user.id}`);
      setSaved(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      setSaved([]);
    }
  }, [user]);

  function toggleSaved(id: string) {
    if (!user) return;
    setSaved((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [id, ...current];
      try {
        localStorage.setItem(`nextgen_saved_${user.id}`, JSON.stringify(next));
      } catch {
        // storage unavailable: the heart still toggles for this visit
      }
      return next;
    });
  }

  function search(event: FormEvent) {
    event.preventDefault();
    const q = query.trim();
    router.push(q ? `/candidat/emplois?q=${encodeURIComponent(q)}` : "/candidat/emplois");
  }

  const appliedIds = useMemo(() => new Set((apps ?? []).map((item) => item.job.id)), [apps]);
  const mySkills = useMemo(() => new Set((me?.skills ?? []).map((skill) => skill.toLowerCase())), [me]);

  const recommended = useMemo(() => {
    const open = (jobs ?? []).filter((job) => !appliedIds.has(job.id));
    return [...open].sort((a, b) => (scores[b.id] ?? -1) - (scores[a.id] ?? -1) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5);
  }, [jobs, scores, appliedIds]);

  const latest = useMemo(() => {
    const shown = new Set(recommended.map((job) => job.id));
    return [...(jobs ?? [])]
      .filter((job) => !shown.has(job.id) && !appliedIds.has(job.id))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 3);
  }, [jobs, recommended, appliedIds]);

  const quick = useMemo(() => {
    const list = jobs ?? [];
    const contracts = Array.from(new Set(list.map((job) => job.contractType).filter(Boolean))).slice(0, 3);
    const places = Array.from(new Set(list.map((job) => job.location.split(",")[0].trim()).filter(Boolean))).slice(0, 2);
    const items: { label: string; href: string }[] = [];
    if (list.some((job) => job.remote)) items.push({ label: "Remote", href: "/candidat/emplois?remote=1" });
    for (const contract of contracts) items.push({ label: CONTRACT_LABEL[contract] ?? contract, href: `/candidat/emplois?contract=${encodeURIComponent(contract)}` });
    for (const place of places) items.push({ label: place, href: `/candidat/emplois?place=${encodeURIComponent(place)}` });
    return items;
  }, [jobs]);

  const profile = useMemo(() => {
    if (!me) return null;
    const steps: { label: string; done: boolean; href: string }[] = [
      { label: "Ajouter un titre professionnel", done: Boolean(me.headline?.trim()), href: "/candidat/cv-builder?step=identite" },
      { label: "Rédiger un résumé", done: Boolean(me.bio?.trim()), href: "/candidat/cv-builder?step=resume" },
      { label: "Indiquer votre lieu", done: Boolean(me.location?.trim()), href: "/candidat/cv-builder?step=identite" },
      { label: "Ajouter une expérience", done: (me.experiences?.length ?? 0) > 0, href: "/candidat/cv-builder?step=experience" },
      { label: "Ajouter une formation", done: (me.educations?.length ?? 0) > 0, href: "/candidat/cv-builder?step=formation" },
      { label: "Lister vos compétences", done: me.skills.length >= 3, href: "/candidat/cv-builder?step=competences" },
    ];
    const done = steps.filter((step) => step.done).length;
    return { percent: Math.round((done / steps.length) * 100), next: steps.find((step) => !step.done) ?? null };
  }, [me]);

  const todoTests = tests.filter((test) => test.status !== "COMPLETED").length;
  const todoInterviews = interviews.filter((item) => item.status !== "COMPLETED").length;
  const todo = [
    todoTests > 0 ? { label: `${todoTests} test${todoTests > 1 ? "s" : ""} à passer`, href: "/candidat/tests" } : null,
    unread > 0 ? { label: `${unread} message${unread > 1 ? "s" : ""} non lu${unread > 1 ? "s" : ""}`, href: "/candidat/messages" } : null,
    todoInterviews > 0 ? { label: `${todoInterviews} entretien${todoInterviews > 1 ? "s" : ""} à reprendre`, href: "/candidat/entretien" } : null,
  ].filter((item): item is { label: string; href: string } => item !== null);

  const firstName = user?.firstName ?? "";

  return (
    <AppShell role="CANDIDATE" plain>
      <div className="mx-auto max-w-5xl">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{firstName ? `Bonjour ${firstName}` : "Bonjour"}</h1>
          <p className="mt-1 text-[15px] text-sage">Trouvez votre prochain poste.</p>
          <form onSubmit={search} className="mt-4 flex gap-2" role="search">
            <label className="sr-only" htmlFor="home-search">
              Rechercher un poste, une entreprise ou une compétence
            </label>
            <input
              id="home-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Poste, entreprise ou compétence"
              className="min-w-0 flex-1 rounded-full border border-line bg-white px-5 py-3 text-[15px] outline-none transition placeholder:text-sage/70 focus:border-forest focus:ring-4 focus:ring-forest/10"
            />
            <button className={`${primaryButton} px-6`}>Rechercher</button>
          </form>
          {quick.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2" aria-label="Raccourcis">
              {quick.map((item) => (
                <Link key={item.label} href={item.href} className="rounded-full border border-line bg-white px-3.5 py-1.5 text-sm font-medium transition hover:border-forest hover:text-forest active:scale-95">
                  {item.label}
                </Link>
              ))}
            </div>
          ) : null}
        </header>

        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-8">
            <section aria-labelledby="reco-title">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 id="reco-title" className="text-lg font-semibold">
                  Recommandées pour vous
                </h2>
                <Link href="/candidat/emplois" className="text-sm font-semibold text-forest hover:underline">
                  Toutes les offres →
                </Link>
              </div>
              {jobs === null ? (
                <div className="space-y-3">
                  <Skeleton className="h-32" />
                  <Skeleton className="h-32" />
                  <Skeleton className="h-32" />
                </div>
              ) : recommended.length === 0 ? (
                <EmptyState title="Aucune offre à vous proposer pour l'instant" text="De nouvelles offres apparaîtront ici dès leur publication. En attendant, complétez votre profil pour de meilleures recommandations." href="/candidat/cv-builder" cta="Compléter mon CV" />
              ) : (
                <ul className="space-y-3">
                  {recommended.map((job) => (
                    <JobCard key={job.id} job={job} score={scores[job.id]} mySkills={mySkills} saved={saved.includes(job.id)} onSave={() => toggleSaved(job.id)} />
                  ))}
                </ul>
              )}
            </section>

            {latest.length > 0 ? (
              <section aria-labelledby="latest-title">
                <h2 id="latest-title" className="mb-3 text-lg font-semibold">
                  Récemment publiées
                </h2>
                <ul className="divide-y divide-line rounded-2xl border border-line bg-white">
                  {latest.map((job) => (
                    <li key={job.id}>
                      <Link href={`/offres/${job.id}`} className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-paper/60">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{job.title}</p>
                          <p className="truncate text-sm text-sage">
                            {job.company.name} · {job.location}
                            {job.remote ? " · Remote" : ""}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs text-sage">{ago(job.createdAt)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>

          <aside className="min-w-0 space-y-4">
            {todo.length > 0 ? (
              <Card className="p-4">
                <h2 className="font-semibold">À faire</h2>
                <ul className="mt-2 space-y-1">
                  {todo.map((item) => (
                    <li key={item.href}>
                      <Link href={item.href} className="flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm font-medium transition hover:bg-tint">
                        {item.label}
                        <span aria-hidden className="text-forest">
                          →
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}

            <Card className="p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold">Votre profil</h2>
                {profile ? <Pill tone={profile.percent === 100 ? "good" : "info"}>{profile.percent} %</Pill> : null}
              </div>
              {profile ? (
                <>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={profile.percent} aria-valuemin={0} aria-valuemax={100}>
                    <div className="h-full rounded-full bg-forest transition-all duration-700" style={{ width: `${profile.percent}%` }} />
                  </div>
                  {profile.next ? (
                    <Link href={profile.next.href} className="mt-3 block text-sm font-semibold text-forest hover:underline">
                      {profile.next.label} →
                    </Link>
                  ) : (
                    <p className="mt-3 text-sm text-sage">Profil complet : les recruteurs vous trouvent plus facilement.</p>
                  )}
                </>
              ) : (
                <Skeleton className="mt-3 h-10" />
              )}
              <div className="mt-3 flex gap-3 border-t border-line pt-3 text-sm">
                <Link href="/candidat/profil" className="font-medium text-forest hover:underline">
                  Mon profil
                </Link>
                <Link href="/candidat/cv" className="font-medium text-forest hover:underline">
                  Mon CV
                </Link>
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold">Mes candidatures</h2>
                {apps && apps.length > 0 ? (
                  <Link href="/candidat/emplois?tab=applied" className="text-sm font-semibold text-forest hover:underline">
                    Voir tout
                  </Link>
                ) : null}
              </div>
              {apps === null ? <Skeleton className="mt-3 h-16" /> : null}
              {apps && apps.length === 0 ? <p className="mt-2 text-sm text-sage">Vous n&apos;avez pas encore postulé. Votre première candidature apparaîtra ici.</p> : null}
              {apps && apps.length > 0 ? (
                <ul className="mt-3 space-y-3">
                  {apps.slice(0, 3).map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{item.job.title}</p>
                        <p className="truncate text-xs text-sage">{item.job.company.name}</p>
                      </div>
                      <Pill tone={item.stage === "REJECTED" ? "bad" : item.stage === "OFFER" || item.stage === "HIRED" ? "good" : "info"} className="shrink-0">
                        {STAGE_LABEL[item.stage] ?? item.stage}
                      </Pill>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Card>

            <Link href="/candidat/fil" className="block rounded-2xl border border-line bg-white px-4 py-3 text-sm font-medium transition hover:border-forest/50 hover:text-forest">
              Fil d&apos;actualité du réseau →
            </Link>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}

function JobCard({ job, score, mySkills, saved, onSave }: { job: Job; score?: number; mySkills: Set<string>; saved: boolean; onSave: () => void }) {
  const matched = job.requiredSkills.filter((skill) => mySkills.has(skill.toLowerCase()));
  return (
    <li>
      <article className="relative rounded-2xl border border-line bg-white p-4 transition hover:border-forest/40 hover:shadow-sm sm:p-5">
        <div className="flex items-start gap-4">
          {/* Very low scores are noise (local similarity model): better no ring than an alarming "7". */}
          {typeof score === "number" && score >= 25 ? <ScoreRing value={score} size={56} label={`Correspondance ${score} %`} /> : null}
          <div className="min-w-0 flex-1 pr-8">
            <p className="text-xs font-semibold uppercase tracking-wide text-sage">{job.company.name}</p>
            <h3 className="mt-0.5 text-base font-semibold leading-snug sm:text-lg">
              <Link href={`/offres/${job.id}`} className="after:absolute after:inset-0 after:content-[''] hover:underline">
                {job.title}
              </Link>
            </h3>
            <p className="mt-1 text-sm text-sage">
              {job.location}
              {job.remote ? " · Remote" : ""}
              {job.contractType ? ` · ${CONTRACT_LABEL[job.contractType] ?? job.contractType}` : ""}
              {salary(job) ? ` · ${salary(job)}` : ""}
            </p>
            {job.requiredSkills.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {job.requiredSkills.slice(0, 6).map((skill) => (
                  <Pill key={skill} tone={mySkills.has(skill.toLowerCase()) ? "good" : "neutral"}>
                    {mySkills.has(skill.toLowerCase()) ? "✓ " : ""}
                    {skill}
                  </Pill>
                ))}
              </div>
            ) : null}
            {job.requiredSkills.length > 0 && mySkills.size > 0 ? (
              <p className="mt-2 text-xs text-sage">
                Vous avez {matched.length} compétence{matched.length > 1 ? "s" : ""} sur {job.requiredSkills.length}.
              </p>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={onSave}
          aria-pressed={saved}
          aria-label={saved ? "Retirer des offres enregistrées" : "Enregistrer cette offre"}
          className={`absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full transition active:scale-90 ${saved ? "text-forest" : "text-sage hover:bg-paper hover:text-forest"}`}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      </article>
    </li>
  );
}

function salary(job: Job) {
  if (!job.salaryMin) return "";
  const max = job.salaryMax ?? job.salaryMin;
  if (job.currency === "TND") return `${Math.round(job.salaryMin / 12).toLocaleString("fr-FR")}–${Math.round(max / 12).toLocaleString("fr-FR")} DT / mois`;
  return `${job.salaryMin.toLocaleString("fr-FR")}–${max.toLocaleString("fr-FR")} € / an`;
}

function ago(iso: string) {
  const days = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86400000));
  if (days === 0) return "aujourd'hui";
  if (days === 1) return "hier";
  if (days < 30) return `il y a ${days} j`;
  return new Date(iso).toLocaleDateString("fr-FR");
}
