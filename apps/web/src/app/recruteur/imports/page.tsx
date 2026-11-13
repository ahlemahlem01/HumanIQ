"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { AppShell, useShellSearch } from "@/components/app-shell";
import { SourcedNote } from "@/components/sourced-note";
import { SourcingTabs } from "@/components/sourcing-tabs";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Job = { id: string; title: string; status: string };
type Shortlist = { created: boolean };

type ImportRow = {
  id: string;
  candidateId: string;
  atsScore: number | null;
  createdAt: string;
  stage: string;
  job: { id: string; title: string };
  candidate: {
    headline: string | null;
    location: string | null;
    skills: string[];
    linkedinUrl: string | null;
    source: string;
    user: { firstName: string; lastName: string };
  };
};

const fieldClass =
  "w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-forest focus:ring-2 focus:ring-forest/20";

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function ImportsContent() {
  const { token } = useAuth();
  const { query } = useShellSearch();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [imports, setImports] = useState<ImportRow[] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");

  const publishedJobs = jobs.filter((job) => job.status === "PUBLISHED");

  async function load() {
    if (!token) return;
    const [mine, recent] = await Promise.all([api<Job[]>("/jobs/mine", { token }), api<ImportRow[]>("/sourcing/imports", { token })]);
    setJobs(mine);
    setImports(recent);
  }

  useEffect(() => {
    load().catch(() => {
      setImports([]);
      setError("Impossible de charger vos imports.");
    });
  }, [token]);

  async function onPaste(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setPending(true);
    setError("");
    setOk("");
    try {
      const result = await api<{ candidate: ImportRow["candidate"]; job: { title: string } }>("/sourcing/linkedin", {
        token,
        body: {
          jobId: String(form.get("jobId")),
          linkedinUrl: String(form.get("linkedinUrl") || "") || undefined,
          fullName: String(form.get("fullName") || "") || undefined,
          headline: String(form.get("headline") || "") || undefined,
          rawText: String(form.get("rawText")),
        },
      });
      setOk(`${result.candidate.user.firstName} ${result.candidate.user.lastName} ajouté à « ${result.job.title} ».`);
      formElement.reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import impossible.");
    } finally {
      setPending(false);
    }
  }

  async function addToJob(candidateId: string) {
    if (!token) return;
    const jobId = choice[candidateId];
    if (!jobId) {
      setNotice("Choisissez d'abord une offre.");
      return;
    }
    setNotice("");
    const result = await api<Shortlist>("/applications/shortlist", { method: "POST", token, body: { jobId, candidateId } });
    setNotice(result.created ? "Profil ajouté aux candidatures de cette offre." : "Ce profil est déjà dans cette offre.");
    await load();
  }

  // One person can appear once per offer: group by candidate.
  const needle = query.trim().toLowerCase();
  const people = new Map<string, { id: string; candidate: ImportRow["candidate"]; rows: ImportRow[] }>();
  for (const row of imports ?? []) {
    const entry = people.get(row.candidateId) ?? { id: row.candidateId, candidate: row.candidate, rows: [] };
    entry.rows.push(row);
    people.set(row.candidateId, entry);
  }
  const list = [...people.values()].filter(({ candidate }) =>
    !needle ||
    `${candidate.user.firstName} ${candidate.user.lastName} ${candidate.headline ?? ""} ${candidate.skills.join(" ")}`.toLowerCase().includes(needle),
  );

  return (
    <div className="mx-auto max-w-[1180px] pb-8">
      <SourcingTabs active="imports" />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight">Mes imports</h1>
          <p className="mt-1 max-w-xl text-sage">
            Les profils que votre entreprise a importés. Ils ne figurent pas dans le vivier et ne sont visibles que de vous.
          </p>
          {notice ? <p className="mt-4 rounded-xl bg-tint px-4 py-2 text-sm text-forest">{notice}</p> : null}

          {imports === null ? <p className="mt-6 text-sm text-sage">Chargement…</p> : null}
          {imports && list.length === 0 ? (
            <p className="mt-6 rounded-xl border border-dashed border-line bg-white px-5 py-12 text-center text-sm text-sage">
              {imports.length === 0 ? "Aucun profil importé pour l'instant. Utilisez le formulaire ou l'extension Chrome." : "Aucun import ne correspond à la recherche."}
            </p>
          ) : null}

          <ul className="mt-6 space-y-4">
            {list.map(({ id, candidate, rows }) => {
              const name = `${candidate.user.firstName} ${candidate.user.lastName}`;
              const inJobs = new Set(rows.map((row) => row.job.id));
              const available = publishedJobs.filter((job) => !inJobs.has(job.id));
              return (
                <li key={id} className="rounded-2xl border border-line bg-white p-5">
                  <div className="flex items-start gap-4">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-tint text-sm font-semibold text-forest">
                      {initials(name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link href={`/recruteur/candidats/${id}`} className="text-lg font-semibold hover:text-forest hover:underline">
                        {name}
                      </Link>
                      <p className="text-sm text-sage">
                        {candidate.headline ?? "Profil importé"}
                        {candidate.location ? ` · ${candidate.location}` : ""}
                      </p>
                      <p className="mt-1 text-xs text-sage">
                        {candidate.source === "LINKEDIN" ? "Importé depuis LinkedIn" : "Importé depuis un texte"}
                        {candidate.linkedinUrl ? (
                          <>
                            {" · "}
                            <a href={candidate.linkedinUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-forest hover:underline">
                              Profil LinkedIn
                            </a>
                          </>
                        ) : null}
                      </p>
                    </div>
                  </div>
                  {candidate.skills.length ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {candidate.skills.slice(0, 8).map((skill) => (
                        <span key={skill} className="rounded-full border border-line px-2.5 py-0.5 text-xs">
                          {skill}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-4 space-y-1.5 border-t border-line pt-3 text-sm">
                    {rows.map((row) => (
                      <p key={row.id} className="flex flex-wrap items-center gap-x-2">
                        <span className="text-sage">Dans l&apos;offre</span>
                        <Link href={`/recruteur/pipeline/${row.job.id}`} className="font-semibold text-forest hover:underline">
                          {row.job.title}
                        </Link>
                        {row.atsScore !== null ? <span className="text-xs text-sage">· score {row.atsScore}</span> : null}
                      </p>
                    ))}
                  </div>
                  {available.length ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <select
                        value={choice[id] ?? ""}
                        onChange={(event) => setChoice((current) => ({ ...current, [id]: event.target.value }))}
                        aria-label={`Autre offre pour ${name}`}
                        className="min-w-0 flex-1 rounded-full border border-line bg-white px-4 py-2 text-sm outline-none focus:border-forest sm:flex-none sm:basis-64"
                      >
                        <option value="">Ajouter à une autre offre…</option>
                        {available.map((job) => (
                          <option key={job.id} value={job.id}>
                            {job.title}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => void addToJob(id)}
                        disabled={!choice[id]}
                        className="rounded-full bg-forest px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        Ajouter
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>

        <aside className="space-y-3 lg:sticky lg:top-20">
          <form onSubmit={onPaste} className="space-y-3 rounded-2xl border border-line bg-cream p-5">
            <h2 className="text-lg font-semibold">Importer un profil</h2>
            <p className="text-xs text-sage">Collez le texte d&apos;un profil LinkedIn pour l&apos;ajouter à une offre.</p>
            <label className="block text-sm font-medium">
              Offre
              <select name="jobId" required className={`mt-1 ${fieldClass}`}>
                {publishedJobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.title}
                  </option>
                ))}
              </select>
            </label>
            <input name="fullName" placeholder="Nom complet" className={fieldClass} />
            <input name="headline" placeholder="Titre" className={fieldClass} />
            <input name="linkedinUrl" placeholder="https://www.linkedin.com/in/…" className={fieldClass} />
            <textarea
              name="rawText"
              required
              minLength={20}
              rows={6}
              placeholder="Collez le texte du profil (à propos, expérience, compétences)…"
              className={fieldClass}
            />
            <button disabled={pending || publishedJobs.length === 0} className="w-full rounded-full bg-forest py-2.5 text-sm font-semibold text-white disabled:opacity-60">
              {pending ? "Import…" : "Ajouter au pipeline"}
            </button>
            {publishedJobs.length === 0 ? <p className="text-xs text-sage">Publiez d&apos;abord une offre pour importer un profil.</p> : null}
            {error ? <p className="text-sm text-red-700">{error}</p> : null}
            {ok ? <p className="text-sm text-good">{ok}</p> : null}
            <SourcedNote />
          </form>

          <details className="rounded-2xl border border-line bg-cream p-5 text-sm">
            <summary className="cursor-pointer text-lg font-semibold">Extension Chrome</summary>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sage">
              <li>
                Chrome → <code className="rounded bg-paper px-1">chrome://extensions</code> → Mode développeur
              </li>
              <li>
                Charger l&apos;extension non empaquetée : dossier <code className="rounded bg-paper px-1">apps/extension</code>
              </li>
              <li>
                Ouvrir{" "}
                <Link href="/demo/linkedin" className="font-semibold text-forest hover:underline">
                  la page démo LinkedIn
                </Link>{" "}
                (ou un vrai /in/…) → icône HumanIQ → connexion recruteur → Importer
              </li>
            </ol>
          </details>
        </aside>
      </div>
    </div>
  );
}

export default function ImportsPage() {
  return (
    <AppShell role="RECRUITER" plain>
      <ImportsContent />
    </AppShell>
  );
}
