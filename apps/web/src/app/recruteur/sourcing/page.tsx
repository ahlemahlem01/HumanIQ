"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { AppShell, useShellSearch } from "@/components/app-shell";
import { SourcingTabs } from "@/components/sourcing-tabs";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Talent = {
  id: string;
  displayName: string;
  headline: string | null;
  location: string | null;
  experienceYears: number;
  skills: string[];
  salaryMin: number | null;
  salaryMax: number | null;
  anonymous: boolean;
  /** Same text as headline/skills, with matches wrapped in the markers ⟦ and ⟧. */
  highlight: { headline: string; skills: string[] };
};

type Facet = { value: string; count: number };

type SearchResult = {
  source: "meilisearch" | "postgres";
  total: number;
  tookMs: number;
  hits: Talent[];
  facets: { skills: Facet[]; location: Facet[] };
};

type Job = { id: string; title: string; status: string };

type Shortlist = { created: boolean };

function SourcingPageContent() {
  const { token } = useAuth();
  const [result, setResult] = useState<SearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [text, setText] = useState("");
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [place, setPlace] = useState("");
  const [minYears, setMinYears] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState("");
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const { query } = useShellSearch();

  // The top search box of the shell and this page's own box drive the same query.
  useEffect(() => {
    setText(query);
  }, [query]);

  // Debounced search: typo-tolerant full text plus facet filters, answered by Meilisearch.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (text.trim()) params.set("q", text.trim());
      if (selectedSkills.length) params.set("skills", selectedSkills.join(","));
      if (place) params.set("location", place);
      if (minYears) params.set("minYears", minYears);
      api<SearchResult>(`/candidates/talents/search?${params.toString()}`, { token })
        .then((data) => {
          if (!cancelled) setResult(data);
        })
        .catch(() => {
          if (!cancelled) setError("Recherche indisponible.");
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [token, text, selectedSkills, place, minYears]);

  function toggleSkill(skill: string) {
    setSelectedSkills((current) => (current.includes(skill) ? current.filter((item) => item !== skill) : [...current, skill]));
  }

  const hasFilters = Boolean(text || selectedSkills.length || place || minYears);

  const publishedJobs = jobs.filter((job) => job.status === "PUBLISHED");

  async function load() {
    if (!token) return;
    setJobs(await api<Job[]>("/jobs/mine", { token }));
  }

  useEffect(() => {
    load().catch(() => setError("Impossible de charger le vivier."));
  }, [token]);

  async function addToJob(candidateId: string) {
    if (!token) return;
    const jobId = choice[candidateId];
    if (!jobId) {
      setNotice("Choisissez d'abord une offre.");
      return;
    }
    setNotice("");
    const result = await api<Shortlist>("/applications/shortlist", { method: "POST", token, body: { jobId, candidateId } });
    setNotice(result.created ? "Profil ajouté aux candidatures." : "Ce profil est déjà dans cette offre.");
  }

  return (
    <>
      <div className="mx-auto max-w-[1180px]">
        <div className="min-w-0">
          <SourcingTabs active="vivier" />
          <header>
            <h1 className="text-3xl font-semibold tracking-tight">Vivier</h1>
            <p className="mt-1 max-w-xl text-sage">
              Profils qui acceptent d&apos;être contactés. Ouvrez-les, puis ajoutez-les à une de vos offres.
            </p>
          </header>

          <div className="relative mt-5">
            <label>
              <span className="sr-only">Rechercher un talent</span>
              <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-sage" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14Zm5-2 4 4" strokeLinecap="round" />
              </svg>
              <input
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Poste, compétence, nom ou ville (les fautes de frappe sont tolérées)"
                className="w-full rounded-xl border border-line bg-white py-3.5 pl-12 pr-4 text-base outline-none focus:border-forest focus:ring-4 focus:ring-forest/10"
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <select
              value={place}
              onChange={(event) => setPlace(event.target.value)}
              aria-label="Lieu"
              className="rounded-full border border-line bg-white px-4 py-1.5 text-sm outline-none focus:border-forest"
            >
              <option value="">Tous les lieux</option>
              {(result?.facets.location ?? []).map((facet) => (
                <option key={facet.value} value={facet.value}>
                  {facet.value} ({facet.count})
                </option>
              ))}
              {place && !(result?.facets.location ?? []).some((facet) => facet.value === place) ? <option value={place}>{place}</option> : null}
            </select>
            <select
              value={minYears}
              onChange={(event) => setMinYears(event.target.value)}
              aria-label="Expérience minimale"
              className="rounded-full border border-line bg-white px-4 py-1.5 text-sm outline-none focus:border-forest"
            >
              <option value="">Toute expérience</option>
              {[1, 3, 5, 8].map((years) => (
                <option key={years} value={years}>
                  {years} ans et plus
                </option>
              ))}
            </select>
            {hasFilters ? (
              <button
                type="button"
                onClick={() => {
                  setText("");
                  setSelectedSkills([]);
                  setPlace("");
                  setMinYears("");
                }}
                className="rounded-full px-3 py-1.5 text-sm font-semibold text-forest hover:bg-tint"
              >
                Tout réinitialiser
              </button>
            ) : null}
          </div>

          {(selectedSkills.length > 0 || (result?.facets.skills.length ?? 0) > 0) ? (
            <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Filtrer par compétence">
              {selectedSkills.map((skill) => (
                <button
                  key={`sel-${skill}`}
                  type="button"
                  onClick={() => toggleSkill(skill)}
                  className="flex items-center gap-1.5 rounded-full border border-forest bg-forest px-3.5 py-1.5 text-sm font-medium text-white transition active:scale-95"
                >
                  {skill}
                  <span aria-hidden>×</span>
                  <span className="sr-only">Retirer le filtre {skill}</span>
                </button>
              ))}
              {(result?.facets.skills ?? [])
                .filter((facet) => !selectedSkills.includes(facet.value))
                .slice(0, 10)
                .map((facet) => (
                  <button
                    key={facet.value}
                    type="button"
                    onClick={() => toggleSkill(facet.value)}
                    className="rounded-full border border-line bg-white px-3.5 py-1.5 text-sm font-medium transition hover:border-forest active:scale-95"
                  >
                    {facet.value} <span className="text-xs text-sage">{facet.count}</span>
                  </button>
                ))}
            </div>
          ) : null}

          {notice ? <p className="mt-4 rounded-xl bg-tint px-4 py-3 text-sm font-medium text-forest">{notice}</p> : null}

          <p className={`mt-5 flex flex-wrap items-center gap-x-2 text-sm text-sage transition-opacity ${searching ? "opacity-60" : "opacity-100"}`} aria-live="polite">
            {result ? (
              <>
                <strong className="font-semibold text-ink">
                  {result.total} profil{result.total > 1 ? "s" : ""}
                </strong>
                <span>· {result.tookMs} ms</span>
                <span className="rounded-full bg-paper px-2 py-0.5 text-[11px] font-medium">
                  {result.source === "meilisearch" ? "Meilisearch" : "Recherche de secours (PostgreSQL)"}
                </span>
              </>
            ) : (
              "Chargement…"
            )}
          </p>
          <ul className="mt-3 space-y-3">
            {result && result.hits.length === 0 ? (
              <li className="rounded-2xl border border-dashed border-line bg-white px-5 py-10 text-center text-sm text-sage">
                Aucun profil ne correspond. Essayez moins de filtres ou une autre orthographe.
              </li>
            ) : null}
            {(result?.hits ?? []).map((talent) => (
              <li key={talent.id} className="rounded-2xl border border-line bg-white p-5">
                <div className="flex gap-4">
                  <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-tint text-lg font-semibold text-forest">
                    {initials(talent.displayName)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link href={`/recruteur/candidats/${talent.id}`} className="text-lg font-semibold hover:text-forest hover:underline">
                          {talent.displayName}
                        </Link>
                        {talent.anonymous ? (
                          <span className="ml-2 rounded-full bg-paper px-2 py-0.5 text-[11px] font-medium text-sage">Nom masqué</span>
                        ) : null}
                        <p className="text-sm">
                          <Highlight text={talent.highlight.headline || talent.headline || "Sans titre"} />
                        </p>
                        <p className="text-sm text-sage">
                          {talent.location || "Lieu non précisé"} · {talent.experienceYears} an{talent.experienceYears > 1 ? "s" : ""} d&apos;expérience
                        </p>
                      </div>
                      <p className="shrink-0 rounded-md bg-paper px-3 py-1 text-sm font-medium">
                        {talent.salaryMin
                          ? `${talent.salaryMin.toLocaleString("fr-FR")}–${talent.salaryMax?.toLocaleString("fr-FR")} € / an`
                          : "Prétentions non précisées"}
                      </p>
                    </div>
                    {talent.skills.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {talent.highlight.skills.map((skill) => {
                          const plain = skill.replace(/[\u27e6\u27e7]/g, "");
                          return (
                            <span
                              key={plain}
                              className={`rounded-full border px-3 py-0.5 text-xs font-medium ${
                                selectedSkills.includes(plain) ? "border-forest bg-tint text-forest" : "border-line"
                              }`}
                            >
                              <Highlight text={skill} />
                            </span>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
                  <select
                    value={choice[talent.id] ?? ""}
                    onChange={(event) => setChoice((current) => ({ ...current, [talent.id]: event.target.value }))}
                    aria-label={`Offre pour ${talent.displayName}`}
                    className="min-w-0 flex-1 rounded-full border border-line bg-white px-4 py-2 text-sm outline-none focus:border-forest sm:flex-none sm:basis-64"
                  >
                    <option value="">Choisir une offre…</option>
                    {publishedJobs.map((job) => (
                      <option key={job.id} value={job.id}>
                        {job.title}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => addToJob(talent.id)}
                    className="rounded-full bg-forest px-5 py-2 text-sm font-semibold text-white"
                  >
                    Ajouter à l&apos;offre
                  </button>
                  <Link
                    href={`/recruteur/messages?candidate=${talent.id}`}
                    className="rounded-full border border-forest px-5 py-2 text-sm font-semibold text-forest hover:bg-tint"
                  >
                    Contacter
                  </Link>
                  <Link
                    href={`/recruteur/candidats/${talent.id}`}
                    className="rounded-full px-4 py-2 text-sm font-semibold text-forest hover:bg-tint"
                  >
                    Voir le profil
                  </Link>
                </div>
              </li>
            ))}
          </ul>
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

/** Renders text where matches are wrapped in the markers ⟦ and ⟧ (never as HTML). */
function Highlight({ text }: { text: string }) {
  const parts = text.split(/([\u27e6][^\u27e7]*[\u27e7])/);
  return (
    <>
      {parts.map((part, index) =>
        part.startsWith("\u27e6") ? (
          <mark key={index} className="rounded bg-yellow-100 px-0.5 text-inherit">
            {part.replace(/[\u27e6\u27e7]/g, "")}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  );
}

// The content must sit INSIDE AppShell: useShellSearch() reads the search box of the shell's header.
export default function SourcingPage() {
  return (
    <AppShell role="RECRUITER" plain>
      <SourcingPageContent />
    </AppShell>
  );
}
