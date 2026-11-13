"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell, useShellSearch } from "@/components/app-shell";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Job = {
  id: string;
  title: string;
  status: string;
  location: string;
  description: string;
  contractType: string;
  remote: boolean;
  requiredSkills: string[];
  _count: { applications: number };
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
const FILTERS = [
  { id: "ALL", label: "Toutes" },
  { id: "PUBLISHED", label: "Publiées" },
  { id: "PAUSED", label: "En pause" },
  { id: "DRAFT", label: "Brouillons" },
  { id: "CLOSED", label: "Fermées" },
];

function MyJobs() {
  const { token } = useAuth();
  const { query } = useShellSearch();
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [filter, setFilter] = useState("ALL");

  useEffect(() => {
    if (!token) return;
    api<Job[]>("/jobs/mine", { token })
      .then(setJobs)
      .catch(() => setJobs([]));
  }, [token]);

  const needle = query.trim().toLowerCase();
  const visible = (jobs ?? []).filter(
    (job) =>
      (filter === "ALL" || job.status === filter) &&
      (!needle || `${job.title} ${job.location} ${job.requiredSkills.join(" ")}`.toLowerCase().includes(needle)),
  );

  return (
    <div className="mx-auto max-w-[900px] pb-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Mes offres</h1>
          <p className="mt-2 text-sm text-sage">
            {jobs === null ? "Chargement…" : `${jobs.length} offre${jobs.length > 1 ? "s" : ""} au total`}
          </p>
        </div>
        <Link href="/recruteur/offres/nouvelle" className="rounded-full bg-forest px-6 py-2.5 text-sm font-semibold text-white hover:bg-forest-dark">
          + Créer une offre
        </Link>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${
              filter === item.id ? "border-forest bg-forest text-white" : "border-line bg-white text-sage hover:border-forest"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {jobs && jobs.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-line bg-white px-6 py-14 text-center">
          <p className="text-lg font-semibold">Aucune offre pour le moment</p>
          <p className="mt-2 text-sm text-sage">La première publication ouvre le suivi des candidatures.</p>
          <Link href="/recruteur/offres/nouvelle" className="mt-6 inline-block rounded-full bg-forest px-6 py-2.5 text-sm font-semibold text-white">
            Créer ma première offre
          </Link>
        </div>
      ) : null}
      {jobs && jobs.length > 0 && visible.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-line bg-white px-5 py-10 text-center text-sm text-sage">
          Aucune offre ne correspond à ce filtre.
        </p>
      ) : null}

      <ul className="mt-6 space-y-4">
        {visible.map((job) => (
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
              {job.location} · {job.contractType}
              {job.remote ? " · Télétravail" : ""} · {job._count.applications} candidature{job._count.applications > 1 ? "s" : ""}
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
  );
}

export default function RecruiterOffersPage() {
  return (
    <AppShell role="RECRUITER" plain>
      <MyJobs />
    </AppShell>
  );
}
