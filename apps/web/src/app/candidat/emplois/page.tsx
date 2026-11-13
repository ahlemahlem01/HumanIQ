"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { CompanyLogo } from "@/components/company-logo";
import { AppShell, useShellSearch } from "@/components/app-shell";
import { MatchInsight, type MatchData } from "@/components/match-insight";
import { api, STAGE_LABEL } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Job = {
  id: string;
  title: string;
  description: string;
  location: string;
  remote: boolean;
  contractType: string;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string;
  requiredSkills: string[];
  createdAt: string;
  company: { name: string; logoUrl?: string | null };
};

type Recommendation = {
  score?: number;
  semanticScore: number;
  job: { id: string };
};

type Application = {
  id: string;
  stage: string;
  job: Job;
};

type Tab = "matches" | "recent" | "saved" | "applied";

const TABS: [Tab, string][] = [
  ["matches", "Meilleurs matchs"],
  ["recent", "Plus récentes"],
  ["saved", "Enregistrées"],
  ["applied", "Candidatures"],
];

// useSearchParams() needs a Suspense boundary so the page can be pre-rendered in production builds.
export default function JobsPage() {
  // The content must sit INSIDE AppShell: useShellSearch() reads the search box of the shell's header.
  return (
    <Suspense fallback={null}>
      <AppShell role="CANDIDATE" plain>
        <JobsContent />
      </AppShell>
    </Suspense>
  );
}

function JobsContent() {
  const params = useSearchParams();
  const { token, user } = useAuth();
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [apps, setApps] = useState<Application[]>([]);
  const [tab, setTab] = useState<Tab>("matches");
  const { query, setQuery } = useShellSearch();
  const [place, setPlace] = useState("");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [contract, setContract] = useState("");
  const [saved, setSaved] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState("");
  const [matches, setMatches] = useState<Record<string, MatchData>>({});

  useEffect(() => {
    if (!token) return;
    api<Job[]>("/jobs", { token }).then(setJobs).catch(() => setJobs([]));
    api<Recommendation[]>("/ai/recommendations", { token })
      .then((rows) => setScores(Object.fromEntries(rows.map((row) => [row.job.id, row.score ?? row.semanticScore]))))
      .catch(() => setScores({}));
    api<Application[]>("/applications/mine", { token }).then(setApps).catch(() => setApps([]));
  }, [token]);

  // Links from the home page can arrive pre-filtered: ?q=…&remote=1&contract=CDI&place=Paris&tab=applied
  useEffect(() => {
    const q = params.get("q");
    if (q) setQuery(q);
    if (params.get("remote") === "1") setRemoteOnly(true);
    const wantedContract = params.get("contract");
    if (wantedContract) setContract(wantedContract);
    const wantedPlace = params.get("place");
    if (wantedPlace) setPlace(wantedPlace);
    const wantedTab = params.get("tab");
    if (wantedTab === "matches" || wantedTab === "recent" || wantedTab === "saved" || wantedTab === "applied") setTab(wantedTab);
  }, [params, setQuery]);

  useEffect(() => {
    if (!user) return;
    const raw = localStorage.getItem(`nextgen_saved_${user.id}`);
    setSaved(raw ? (JSON.parse(raw) as string[]) : []);
  }, [user]);

  function toggleSaved(id: string) {
    if (!user) return;
    setSaved((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [id, ...current];
      localStorage.setItem(`nextgen_saved_${user.id}`, JSON.stringify(next));
      return next;
    });
  }

  const appliedIds = useMemo(() => new Set(apps.map((item) => item.job.id)), [apps]);
  const contracts = useMemo(() => Array.from(new Set((jobs ?? []).map((job) => job.contractType).filter(Boolean))), [jobs]);

  const visible = useMemo(() => {
    const source = tab === "applied" ? apps.map((item) => item.job) : (jobs ?? []);
    const needle = query.trim().toLowerCase();
    return source
      .filter((job) => {
        if (tab === "saved" && !saved.includes(job.id)) return false;
        if (remoteOnly && !job.remote) return false;
        if (contract && job.contractType !== contract) return false;
        if (place.trim() && !job.location.toLowerCase().includes(place.trim().toLowerCase())) return false;
        if (!needle) return true;
        const text = `${job.title} ${job.company.name} ${job.location} ${job.requiredSkills.join(" ")}`.toLowerCase();
        return text.includes(needle);
      })
      .sort((a, b) => {
        if (tab === "matches") return (scores[b.id] ?? -1) - (scores[a.id] ?? -1);
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [apps, contract, jobs, place, query, remoteOnly, saved, scores, tab]);

  const selected = visible.find((job) => job.id === selectedId) ?? visible[0] ?? null;
  const selectedApp = selected ? apps.find((item) => item.job.id === selected.id) : undefined;

  const selectedKey = selected?.id ?? null;
  useEffect(() => {
    if (!token || !selectedKey || matches[selectedKey]) return;
    api<MatchData>(`/ai/match/${selectedKey}`, { token })
      .then((data) => setMatches((current) => ({ ...current, [selectedKey]: data })))
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, selectedKey]);

  async function apply(job: Job) {
    if (!token) return;
    setApplying(true);
    setMessage("");
    try {
      await api("/applications", { token, body: { jobId: job.id } });
      setApps(await api<Application[]>("/applications/mine", { token }));
      setMessage("Candidature envoyée. Elle apparaît dans le pipeline du recruteur.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Impossible de postuler.");
    } finally {
      setApplying(false);
    }
  }

  return (
    <>
      <div className="mx-auto max-w-[1180px]">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Emplois</h1>
            <p className="mt-1 text-sage">
              {jobs === null ? "Chargement…" : `${visible.length} offre${visible.length > 1 ? "s" : ""} correspondent à vos critères.`}
            </p>
          </div>
        </header>

        <div className="mt-5 flex flex-col gap-3 md:flex-row">
          <label className="relative block flex-1">
            <span className="sr-only">Rechercher une offre</span>
            <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-sage" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14Zm5-2 4 4" strokeLinecap="round" />
            </svg>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Titre, compétence ou entreprise"
              className="w-full rounded-full border border-line bg-white py-3 pl-12 pr-5 text-sm outline-none focus:border-forest focus:ring-2 focus:ring-forest/20"
            />
          </label>
          <input
            value={place}
            onChange={(event) => setPlace(event.target.value)}
            placeholder="Ville ou pays"
            className="rounded-full border border-line bg-white px-5 py-3 text-sm outline-none focus:border-forest focus:ring-2 focus:ring-forest/20 md:w-56"
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
                tab === id ? "border-forest bg-forest text-white" : "border-line bg-white text-ink hover:border-forest"
              }`}
            >
              {label}
              {id === "saved" ? ` (${saved.length})` : ""}
              {id === "applied" ? ` (${apps.length})` : ""}
            </button>
          ))}
          <span className="mx-1 hidden h-6 w-px bg-line md:block" />
          <button
            type="button"
            onClick={() => setRemoteOnly((value) => !value)}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
              remoteOnly ? "border-forest bg-tint text-forest" : "border-line bg-white text-ink hover:border-forest"
            }`}
          >
            Télétravail
          </button>
          {contracts.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setContract((current) => (current === type ? "" : type))}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
                contract === type ? "border-forest bg-tint text-forest" : "border-line bg-white text-ink hover:border-forest"
              }`}
            >
              {type}
            </button>
          ))}
        </div>

        <div className="mt-5 grid items-start gap-5 lg:grid-cols-[400px_minmax(0,1fr)]">
          {/* List */}
          <ul className="overflow-hidden rounded-2xl border border-line bg-white">
            {jobs === null ? <li className="p-6 text-sm text-sage">Chargement des offres…</li> : null}
            {jobs && visible.length === 0 ? <li className="p-6 text-sm text-sage">Aucune offre dans cette vue.</li> : null}
            {visible.map((job) => {
              const active = selected?.id === job.id;
              return (
                <li key={job.id} className="border-b border-line last:border-b-0">
                  <div
                    className={`flex gap-3 border-l-4 p-4 transition ${
                      active ? "border-forest bg-tint/60" : "border-transparent hover:bg-paper"
                    }`}
                  >
                    <CompanyLogo company={job.company} className="h-12 w-12 rounded-lg text-sm" />
                    <button type="button" onClick={() => setSelectedId(job.id)} className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-[15px] font-semibold text-forest">{job.title}</span>
                      <span className="block truncate text-sm">{job.company.name}</span>
                      <span className="block truncate text-sm text-sage">
                        {job.location}
                        {job.remote ? " (Télétravail)" : ""}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-sage">
                        {scores[job.id] != null ? <span className="font-semibold text-good">{scores[job.id]}% de match</span> : null}
                        <span>{postedAgo(job.createdAt)}</span>
                        {appliedIds.has(job.id) ? <span className="font-semibold text-forest">Candidature envoyée</span> : null}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleSaved(job.id)}
                      aria-label={saved.includes(job.id) ? "Retirer des enregistrées" : "Enregistrer"}
                      className={`h-8 w-8 shrink-0 rounded-full text-lg leading-none hover:bg-paper ${saved.includes(job.id) ? "text-forest" : "text-sage"}`}
                    >
                      {saved.includes(job.id) ? "♥" : "♡"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Detail */}
          {selected ? (
            <article className="hidden rounded-2xl border border-line bg-white p-7 lg:sticky lg:top-20 lg:block">
              <div className="flex items-start gap-4">
                <CompanyLogo company={selected.company} className="h-16 w-16 rounded-xl text-lg" />
                <div className="min-w-0">
                  <h2 className="text-2xl font-semibold leading-tight">{selected.title}</h2>
                  <p className="mt-1 text-sm">{selected.company.name}</p>
                  <p className="text-sm text-sage">
                    {selected.location}
                    {selected.remote ? " · Télétravail" : ""} · publiée {postedAgo(selected.createdAt)}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-sm">
                {selected.contractType ? <span className="rounded-md bg-paper px-3 py-1 font-medium">{selected.contractType}</span> : null}
                <span className="rounded-md bg-paper px-3 py-1 font-medium">{salaryLabel(selected)}</span>
                {scores[selected.id] != null ? (
                  <span className="rounded-md bg-emerald-50 px-3 py-1 font-semibold text-good">{scores[selected.id]}% de match</span>
                ) : null}
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                {selectedApp ? (
                  <span className="rounded-full bg-tint px-5 py-2.5 text-sm font-semibold text-forest">
                    Candidature envoyée · {STAGE_LABEL[selectedApp.stage] ?? selectedApp.stage}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => void apply(selected)}
                    disabled={applying}
                    className="rounded-full bg-forest px-7 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {applying ? "Envoi…" : "Postuler"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => toggleSaved(selected.id)}
                  className="rounded-full border border-forest px-6 py-2.5 text-sm font-semibold text-forest hover:bg-tint"
                >
                  {saved.includes(selected.id) ? "Enregistrée" : "Enregistrer"}
                </button>
                <Link href={`/offres/${selected.id}`} className="text-sm font-semibold text-forest hover:underline">
                  Voir l&apos;offre complète
                </Link>
              </div>
              {message ? <p className="mt-3 text-sm text-forest">{message}</p> : null}

              {matches[selected.id] ? (
                <div className="mt-6">
                  <MatchInsight match={matches[selected.id]} />
                </div>
              ) : null}

              <hr className="my-6 border-line" />
              <h3 className="text-lg font-semibold">À propos de l&apos;offre</h3>
              <p className="mt-3 whitespace-pre-wrap text-[15px] leading-7">{selected.description}</p>

              {selected.requiredSkills.length > 0 ? (
                <>
                  <h3 className="mt-6 text-lg font-semibold">Compétences</h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selected.requiredSkills.map((skill) => (
                      <span key={skill} className="rounded-full border border-line px-3 py-1 text-sm font-medium">
                        {skill}
                      </span>
                    ))}
                  </div>
                </>
              ) : null}
            </article>
          ) : (
            <div className="hidden rounded-2xl border border-dashed border-line p-10 text-center text-sm text-sage lg:block">
              Sélectionnez une offre pour voir son détail.
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function salaryLabel(job: Job) {
  if (!job.salaryMin) return "Salaire non précisé";
  if (job.currency === "TND") {
    const min = Math.round(job.salaryMin / 12).toLocaleString("fr-FR");
    const max = job.salaryMax ? Math.round(job.salaryMax / 12).toLocaleString("fr-FR") : null;
    return max ? `${min}–${max} DT / mois` : `${min} DT / mois`;
  }
  const min = Math.round(job.salaryMin / 1000);
  const max = job.salaryMax ? Math.round(job.salaryMax / 1000) : null;
  return max ? `${min}–${max} k€ / an` : `${min} k€ / an`;
}

function postedAgo(iso: string) {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `il y a ${days} j`;
  return new Date(iso).toLocaleDateString("fr-FR");
}
