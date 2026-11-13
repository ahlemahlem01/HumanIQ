"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { BannerCarousel, type BannerSlide } from "@/components/banner-carousel";
import { AreaChart, FunnelBars, Meter, type DayPoint } from "@/components/charts";
import { api, mediaUrl, STAGE_LABEL } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Job = {
  id: string;
  title: string;
  status: string;
  location: string;
  description: string;
  contractType: string;
  remote: boolean;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string;
  requiredSkills: string[];
  _count: { applications: number };
};
type Talent = { id: string };
type Stats = {
  days: number;
  total: number;
  previousTotal: number;
  hired: number;
  rejected: number;
  activeJobs: number;
  avgScore: number | null;
  funnel: { stage: string; reached: number; current: number }[];
  perDay: DayPoint[];
  byJob: { jobId: string; title: string; status: string; applications: number; avgScore: number | null }[];
};
type Me = {
  title: string | null;
  avatarImage: string | null;
  memberStatus?: "ACTIVE" | "PENDING" | "REJECTED";
  company: { name: string; verifiedAt?: string | null };
  user: { firstName: string; lastName: string };
};

const STATUS: Record<string, string> = {
  DRAFT: "Brouillon",
  PUBLISHED: "Publiée",
  PAUSED: "En pause",
  CLOSED: "Fermée",
};

const STATUS_STYLE: Record<string, string> = {
  DRAFT: "bg-paper text-sage",
  PUBLISHED: "bg-emerald-50 text-good",
  PAUSED: "bg-amber-50 text-warn",
  CLOSED: "bg-red-50 text-red-700",
};

export default function RecruiterHome() {
  const { token, user } = useAuth();
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [pool, setPool] = useState(0);
  const [me, setMe] = useState<Me | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [statsLoading, setStatsLoading] = useState(false);
  const [tableView, setTableView] = useState({ timeline: false, funnel: false });
  const company = user?.recruiter?.company?.name;
  const delta =
    stats && stats.previousTotal > 0 ? Math.round(((stats.total - stats.previousTotal) / stats.previousTotal) * 100) : null;

  useEffect(() => {
    if (!token) return;
    api<Job[]>("/jobs/mine", { token }).then(setJobs).catch(() => setJobs([]));
    api<Talent[]>("/candidates/reverse-pool", { token }).then((rows) => setPool(rows.length)).catch(() => setPool(0));
    api<Me>("/recruiters/me", { token }).then(setMe).catch(() => setMe(null));
  }, [token]);

  useEffect(() => {
    if (!token) return;
    setStatsLoading(true);
    api<Stats>(`/applications/stats?days=${days}`, { token })
      .then(setStats)
      .catch(() => undefined)
      .finally(() => setStatsLoading(false));
  }, [token, days]);

  const toReview = stats?.funnel[0]?.current ?? 0;
  const firstJob = jobs?.[0];
  const slides: BannerSlide[] = [
    {
      id: "welcome",
      kicker: company || "Votre entreprise",
      title: `Bonjour ${user?.firstName ?? ""}`,
      body: "Publiez une offre, puis ajoutez les profils du vivier à vos candidatures.",
      icon: "M8 7V5h8v2M4 7h16v12H4V7Z",
      primary: { label: "Publier une offre", href: "/recruteur/offres/nouvelle" },
      secondary: { label: "Ouvrir le vivier", href: "/recruteur/sourcing" },
    },
    {
      id: "review",
      kicker: "À traiter",
      title:
        toReview > 0
          ? `${toReview} candidature${toReview > 1 ? "s" : ""} à examiner`
          : "Aucune candidature en attente",
      body: "Triez-les par score de compatibilité IA directement dans le pipeline.",
      icon: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-6 8a6 6 0 0 1 12 0M17 11a3 3 0 1 0 0-6M21 19a5 5 0 0 0-4-4.9",
      primary: { label: "Ouvrir le pipeline", href: firstJob ? `/recruteur/pipeline/${firstJob.id}` : "/recruteur/offres" },
    },
    {
      id: "matching",
      kicker: "Matching IA",
      title: "Trouvez des profils proches de vos offres",
      body: "Le matching sémantique classe le vivier selon la proximité de sens avec chaque offre.",
      icon: "M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3Z",
      primary: { label: "Voir le vivier", href: "/recruteur/sourcing" },
    },
    {
      id: "extension",
      kicker: "Extension Chrome",
      title: "Importez un profil LinkedIn en un clic",
      body: "Ajoutez un candidat à votre pipeline depuis son profil, sans quitter LinkedIn.",
      icon: "M12 3v12m0 0-4-4m4 4 4-4M5 19h14",
      primary: { label: "Installer l'extension", href: "/recruteur/sourcing" },
    },
  ];

  return (
    <AppShell role="RECRUITER" plain>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          {me?.memberStatus === "PENDING" ? (
            <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-warn">
              <p className="font-semibold">Votre demande d&apos;accès est en attente</p>
              <p>
                Votre adresse e-mail correspond à l&apos;entreprise {me.company.name}, qui a déjà un responsable. Il doit accepter votre demande
                (page Équipe de son compte) avant que vous puissiez utiliser la plateforme.
              </p>
            </div>
          ) : null}
          {me?.memberStatus === "REJECTED" ? (
            <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm leading-6 text-red-700">
              <p className="font-semibold">Votre demande d&apos;accès a été refusée</p>
              <p>
                Le responsable de {me.company.name} n&apos;a pas accepté votre demande. Si vous pensez qu&apos;il s&apos;agit d&apos;une erreur,
                contactez-le directement.
              </p>
            </div>
          ) : null}
          {me && me.memberStatus === "ACTIVE" && !me.company.verifiedAt ? (
            <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-warn">
              <p className="font-semibold">Votre entreprise est en cours de vérification</p>
              <p>
                Vous pouvez préparer vos offres. L&apos;accès à la CVthèque, au vivier et à la messagerie avec les candidats s&apos;ouvrira dès
                que l&apos;équipe HumanIQ aura validé votre entreprise, et vos offres ne seront visibles des candidats qu&apos;à ce moment.
              </p>
            </div>
          ) : null}
          <BannerCarousel slides={slides} />

          <section aria-label="Analyse du recrutement" className="mt-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">Analyse du recrutement</h2>
              <div role="group" aria-label="Période" className="flex gap-1 rounded-full border border-line bg-white p-1">
                {([7, 30, 90] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setDays(value)}
                    aria-pressed={days === value}
                    className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                      days === value ? "bg-forest text-white" : "text-sage hover:text-ink"
                    }`}
                  >
                    {value} jours
                  </button>
                ))}
              </div>
            </div>

            <div className={`transition-opacity duration-200 ${statsLoading ? "opacity-60" : "opacity-100"}`}>
              <div className="mt-4 grid gap-4 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
                <div className="rounded-2xl border border-line bg-white p-5">
                  <p className="text-sm text-sage">Candidatures reçues</p>
                  <p className="mt-1 text-5xl font-bold leading-none tracking-tight text-ink">{stats ? stats.total : "–"}</p>
                  <p className={`mt-3 text-sm ${delta != null && delta < 0 ? "text-warn" : "text-sage"}`}>
                    {!stats
                      ? " "
                      : delta != null
                        ? `${delta >= 0 ? "▲ +" : "▼ "}${delta} % vs les ${days} jours précédents`
                        : stats.total > 0
                          ? "Première période avec des candidatures"
                          : "Aucune candidature sur la période"}
                  </p>
                </div>
                {[
                  ["Offres publiées", stats ? String(stats.activeJobs) : "–"],
                  ["Score moyen IA", stats?.avgScore != null ? `${stats.avgScore}%` : "–"],
                  ["Profils ouverts", String(pool)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-line bg-white p-5">
                    <p className="text-sm text-sage">{label}</p>
                    <p className="mt-1 text-3xl font-bold text-ink">{value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                <section className="rounded-2xl border border-line bg-white p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold">Candidatures par jour</h3>
                      <p className="text-xs text-sage">{days} derniers jours</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setTableView((value) => ({ ...value, timeline: !value.timeline }))}
                      className="text-xs font-semibold text-forest hover:underline"
                    >
                      {tableView.timeline ? "Voir le graphique" : "Voir le tableau"}
                    </button>
                  </div>
                  <div className="mt-3">
                    {!stats ? (
                      <p className="py-16 text-center text-sm text-sage">Chargement…</p>
                    ) : tableView.timeline ? (
                      <div className="max-h-56 overflow-auto">
                        <table className="w-full text-sm">
                          <caption className="sr-only">Candidatures par jour</caption>
                          <thead>
                            <tr className="text-left text-xs text-sage">
                              <th className="py-1 font-medium">Jour</th>
                              <th className="py-1 text-right font-medium">Candidatures</th>
                            </tr>
                          </thead>
                          <tbody>
                            {stats.perDay.map((row) => (
                              <tr key={row.date} className="border-t border-line">
                                <td className="py-1">{row.date}</td>
                                <td className="py-1 text-right tabular-nums">{row.count}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <AreaChart data={stats.perDay} unit="candidatures" />
                    )}
                  </div>
                </section>

                <section className="rounded-2xl border border-line bg-white p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold">Entonnoir de recrutement</h3>
                      <p className="text-xs text-sage">Candidatures ayant atteint chaque étape</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setTableView((value) => ({ ...value, funnel: !value.funnel }))}
                      className="text-xs font-semibold text-forest hover:underline"
                    >
                      {tableView.funnel ? "Voir le graphique" : "Voir le tableau"}
                    </button>
                  </div>
                  <div className="mt-5">
                    {!stats ? (
                      <p className="py-16 text-center text-sm text-sage">Chargement…</p>
                    ) : tableView.funnel ? (
                      <table className="w-full text-sm">
                        <caption className="sr-only">Entonnoir de recrutement</caption>
                        <thead>
                          <tr className="text-left text-xs text-sage">
                            <th className="py-1 font-medium">Étape</th>
                            <th className="py-1 text-right font-medium">Atteint</th>
                            <th className="py-1 text-right font-medium">Actuellement</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stats.funnel.map((row) => (
                            <tr key={row.stage} className="border-t border-line">
                              <td className="py-1.5">{STAGE_LABEL[row.stage] ?? row.stage}</td>
                              <td className="py-1.5 text-right tabular-nums">{row.reached}</td>
                              <td className="py-1.5 text-right tabular-nums">{row.current}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <FunnelBars
                        rows={stats.funnel.map((row) => ({ ...row, label: STAGE_LABEL[row.stage] ?? row.stage }))}
                      />
                    )}
                  </div>
                </section>
              </div>

              <section className="mt-4 rounded-2xl border border-line bg-white p-5">
                <h3 className="text-base font-semibold">Performance par offre</h3>
                <p className="text-xs text-sage">Score moyen de compatibilité IA des candidatures reçues</p>
                {!stats ? (
                  <p className="py-6 text-sm text-sage">Chargement…</p>
                ) : stats.byJob.length === 0 ? (
                  <p className="py-6 text-sm text-sage">Aucune offre pour le moment.</p>
                ) : (
                  <ul className="mt-4 divide-y divide-line">
                    {stats.byJob.map((row) => (
                      <li key={row.jobId} className="grid items-center gap-x-4 gap-y-2 py-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_72px_110px]">
                        <Link href={`/recruteur/pipeline/${row.jobId}`} className="truncate text-sm font-medium hover:text-forest hover:underline">
                          {row.title}
                        </Link>
                        <Meter value={row.avgScore} label={`Score moyen ${row.title}`} />
                        <span className="text-sm font-semibold tabular-nums sm:text-right">
                          {row.avgScore != null ? `${row.avgScore}%` : "—"}
                        </span>
                        <span className="text-sm text-sage sm:text-right">
                          {row.applications} candidature{row.applications > 1 ? "s" : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </section>

          <h2 className="mt-8 text-xl font-semibold">Vos offres</h2>
          {jobs === null ? <p className="mt-3 text-sm text-sage">Chargement…</p> : null}
          {jobs && jobs.length === 0 ? (
            <p className="mt-3 rounded-xl border border-dashed border-line bg-white px-5 py-10 text-center text-sm text-sage">
              Aucune offre pour le moment. La première publication ouvre le suivi des candidatures.
            </p>
          ) : null}
          <ul className="mt-4 space-y-4">
            {(jobs ?? []).map((job) => (
              <li key={job.id} className="rounded-2xl border border-line bg-white p-6">
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/recruteur/offres/${job.id}`} className="text-lg font-semibold text-ink hover:text-forest hover:underline">
                    {job.title}
                  </Link>
                  <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLE[job.status] ?? "bg-paper text-sage"}`}>
                    {STATUS[job.status] ?? job.status}
                  </span>
                </div>
                <p className="mt-1 text-sm text-sage">
                  {job.location}
                  {` · ${job._count.applications} candidature${job._count.applications > 1 ? "s" : ""}`}
                </p>
                <p className="mt-3 line-clamp-2 text-sm leading-6 text-ink/80">{job.description}</p>
                <div className="mt-4 flex flex-wrap gap-2 text-sm font-semibold">
                  <Link href={`/recruteur/pipeline/${job.id}`} className="rounded-full bg-forest px-4 py-2 text-white">
                    Candidatures
                  </Link>
                  <Link href={`/recruteur/matching/${job.id}`} className="rounded-full border border-forest px-4 py-2 text-forest hover:bg-tint">
                    Profils proches
                  </Link>
                  <Link href={`/recruteur/offres/${job.id}`} className="rounded-full px-4 py-2 text-forest hover:bg-tint">
                    Voir l&apos;offre
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <aside className="space-y-4">
          <Link href="/recruteur/profil" className="block rounded-3xl bg-paper p-6">
            <span className="flex items-center gap-4">
              <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-forest text-lg font-semibold text-white">
                {me?.avatarImage ? (
                  <img src={mediaUrl(`/uploads/avatars/${me.avatarImage}`)} alt="" className="h-full w-full object-cover" />
                ) : (
                  initials(user?.firstName, user?.lastName)
                )}
              </span>
              <span className="min-w-0">
                <span className="block text-lg font-medium">{user?.firstName} {user?.lastName}</span>
                <span className="block truncate text-sm text-sage">{me?.title || "Poste à préciser"}</span>
                <span className="block truncate text-sm text-sage">{me?.company.name || company || "Entreprise"}</span>
              </span>
            </span>
            <span className="mt-4 inline-block text-base font-semibold text-forest">Voir mon profil</span>
          </Link>
          <section className="rounded-3xl bg-paper p-6">
            <h2 className="text-lg font-medium">Trouver des talents</h2>
            <p className="mt-2 text-sm leading-6 text-sage">
              Parcourez le vivier de candidats visibles et ajoutez-les à vos offres.
            </p>
            <Link href="/recruteur/sourcing" className="mt-4 inline-block text-base font-semibold text-forest hover:underline">
              Voir le vivier
            </Link>
            <br />
            <Link href="/recruteur/cvtheque" className="mt-3 inline-block text-base font-semibold text-forest hover:underline">
              Ouvrir la CVthèque
            </Link>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}

function initials(first?: string, last?: string) {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "•";
}
