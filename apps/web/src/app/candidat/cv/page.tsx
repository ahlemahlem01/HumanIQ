"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card, EmptyState, ghostButton, PageHeader, Pill, primaryButton, ScoreRing, Skeleton } from "@/components/candidate-ui";
import { STAGE_LABEL, api, upload } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Filter = "all" | "ready" | "optimize" | "gap" | "applied";

type Match = {
  job: {
    id: string;
    title: string;
    location: string;
    remote: boolean;
    requiredSkills: string[];
    company: string;
  };
  score: number;
  semanticScore: number | null;
  keywordScore: number;
  matchedKeywords: string[];
  missingKeywords: string[];
  coverage: number;
  similarity: number | null;
  applied: boolean;
  applicationStage: string | null;
};

type Report = {
  dossier: {
    headline: string | null;
    location: string | null;
    experienceYears: number;
    skills: string[];
    cvFileName: string | null;
    cvMimeType: string | null;
    cvPageCount: number | null;
    cvPreview: string;
    cvCharacters: number;
    embedded: boolean;
    embeddingModel: string | null;
    embeddingUpdatedAt: string | null;
  };
  stats: {
    jobsScanned: number;
    bestScore: number | null;
    averageScore: number | null;
    skillGaps: number;
    readyCount: number;
    gapCount: number;
  };
  matches: Match[];
};

type Rewrite = {
  headline: string;
  bullets: string[];
  warning: string;
  generatedBy: { provider: string; model: string };
};

const FILTERS: [Filter, string][] = [
  ["all", "Toutes"],
  ["ready", "Bonnes"],
  ["optimize", "À renforcer"],
  ["gap", "Écarts"],
  ["applied", "Postulées"],
];

export default function CvPage() {
  const { token } = useAuth();
  const fileInput = useRef<HTMLInputElement>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<"file" | "text" | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [rewrites, setRewrites] = useState<Record<string, Rewrite>>({});
  const [openJob, setOpenJob] = useState<string | null>(null);
  const [busyJob, setBusyJob] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setReport(await api<Report>("/ai/cv/report", { token }));
  }, [token]);

  useEffect(() => {
    load().catch(() => setError("Impossible de charger le dossier CV."));
  }, [load]);

  async function ingest(kind: "file" | "text", action: () => Promise<unknown>) {
    setPending(kind);
    setError("");
    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analyse impossible.");
    } finally {
      setPending(null);
    }
  }

  function takeFile(file?: File) {
    if (!file || !token) return;
    void ingest("file", () => upload("/ai/cv/upload", file, { token }));
  }

  function onPaste(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const cvText = String(new FormData(event.currentTarget).get("cvText"));
    void ingest("text", () => api("/ai/parse-cv", { token, body: { cvText } }));
  }

  async function optimize(jobId: string) {
    if (!token) return;
    if (openJob === jobId) {
      setOpenJob(null);
      return;
    }
    setOpenJob(jobId);
    if (rewrites[jobId]) return;
    setBusyJob(jobId);
    setError("");
    try {
      const result = await api<Rewrite>("/ai/cv/rewrite", { token, body: { jobId } });
      setRewrites((prev) => ({ ...prev, [jobId]: result }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Optimisation indisponible.");
      setOpenJob(null);
    } finally {
      setBusyJob(null);
    }
  }

  async function apply(jobId: string) {
    if (!token) return;
    setBusyJob(jobId);
    setError("");
    try {
      await api("/applications", { token, body: { jobId } });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de postuler.");
    } finally {
      setBusyJob(null);
    }
  }

  async function copyText(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied((current) => (current === key ? null : current)), 1600);
    } catch {
      setError("Copie impossible : sélectionnez le texte à la main.");
    }
  }

  const dossier = report?.dossier;
  const matches = useMemo(() => report?.matches ?? [], [report]);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return matches.filter((item) => {
      if (filter === "ready" && item.score < 70) return false;
      if (filter === "optimize" && (item.score < 50 || item.score >= 70)) return false;
      if (filter === "gap" && item.score >= 50) return false;
      if (filter === "applied" && !item.applied) return false;
      if (!needle) return true;
      return `${item.job.title} ${item.job.company} ${item.job.location}`.toLowerCase().includes(needle);
    });
  }, [matches, filter, query]);

  const filterCounts: Record<Filter, number> = {
    all: matches.length,
    ready: matches.filter((item) => item.score >= 70).length,
    optimize: matches.filter((item) => item.score >= 50 && item.score < 70).length,
    gap: matches.filter((item) => item.score < 50).length,
    applied: matches.filter((item) => item.applied).length,
  };

  const hasCv = Boolean(dossier?.cvCharacters);

  return (
    <AppShell role="CANDIDATE" plain>
      <div className="mx-auto max-w-3xl">
        <PageHeader
          title="Votre CV"
          intro="Voyez les offres qui vous correspondent, puis renforcez le CV pour chacune. Rien n'est inventé."
          action={
            <div className="flex flex-wrap gap-2">
              <Link href="/candidat/ats" className={ghostButton}>
                Analyse ATS
              </Link>
              <Link href="/candidat/cv-builder" className={primaryButton}>
                Créer un CV
              </Link>
            </div>
          }
        />

        <input
          ref={fileInput}
          type="file"
          accept=".pdf,.docx,.txt,.md"
          className="hidden"
          onChange={(event) => {
            takeFile(event.currentTarget.files?.[0]);
            event.currentTarget.value = "";
          }}
        />

        <section
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            takeFile(event.dataTransfer.files[0]);
          }}
          className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed px-5 py-4 transition ${
            dragOver ? "border-forest bg-tint" : "border-line bg-white"
          }`}
        >
          <div>
            <p className="font-semibold">{hasCv ? "Remplacer le CV" : "Déposez votre CV"}</p>
            <p className="mt-0.5 text-sm text-sage">Glissez un fichier ici · PDF, Word ou texte · 8 Mo max</p>
          </div>
          <button type="button" disabled={pending !== null} onClick={() => fileInput.current?.click()} className={primaryButton}>
            {pending === "file" ? "Lecture…" : "Choisir un fichier"}
          </button>
        </section>

        <details className="group mt-2 rounded-2xl border border-line bg-white px-5 py-3">
          <summary className="cursor-pointer list-none text-sm font-medium">Ou coller le texte du CV</summary>
          <form onSubmit={onPaste} className="mt-3">
            <textarea
              name="cvText"
              required
              minLength={40}
              rows={6}
              aria-label="Texte du CV"
              placeholder="Expérience, compétences, réalisations…"
              className="w-full resize-y rounded-xl border border-line bg-white p-3 text-sm leading-6 outline-none transition focus:border-forest focus:ring-4 focus:ring-forest/10"
            />
            <button disabled={pending !== null} className={`${primaryButton} mt-3`}>
              {pending === "text" ? "Analyse…" : "Analyser ce texte"}
            </button>
          </form>
        </details>

        {error ? (
          <p role="alert" className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-warn">
            {error}
          </p>
        ) : null}

        {report === null && !error ? <Skeleton className="mt-4 h-28" /> : null}

        {dossier && hasCv ? (
          <Card className="mt-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">{dossier.headline || "CV importé"}</p>
                <p className="mt-1 text-sm text-sage">
                  {dossier.cvFileName ?? "Texte collé"}
                  {dossier.cvPageCount ? ` · ${dossier.cvPageCount} p.` : ""}
                  {` · ${dossier.experienceYears} an${dossier.experienceYears > 1 ? "s" : ""}`}
                  {dossier.location ? ` · ${dossier.location}` : ""}
                </p>
              </div>
              {dossier.skills.length ? (
                <button type="button" onClick={() => void copyText("skills", dossier.skills.join(" · "))} className={ghostButton}>
                  {copied === "skills" ? "Copié ✓" : "Copier les compétences"}
                </button>
              ) : null}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {dossier.skills.length ? (
                dossier.skills.map((skill) => (
                  <Pill key={skill} tone="neutral">
                    {skill}
                  </Pill>
                ))
              ) : (
                <span className="text-sm text-sage">Aucune compétence reconnue. Vérifiez le CV.</span>
              )}
            </div>
          </Card>
        ) : null}

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MiniStat label="Meilleur match" value={report?.stats.bestScore} suffix=" %" />
          <MiniStat label="Moyenne" value={report?.stats.averageScore} suffix=" %" />
          <MiniStat label="Prêtes à postuler" value={report?.stats.readyCount} />
          <MiniStat label="À renforcer" value={report?.stats.gapCount} />
        </div>

        <div className="mt-6 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Filtrer les offres">
          {FILTERS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={filter === id}
              onClick={() => setFilter(id)}
              className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition active:scale-95 ${
                filter === id ? "border-forest bg-forest text-white" : "border-line bg-white text-ink hover:border-forest/50"
              }`}
            >
              {label} ({filterCounts[id]})
            </button>
          ))}
        </div>

        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Rechercher une offre"
          aria-label="Rechercher une offre"
          className="mt-3 w-full rounded-full border border-line bg-white px-4 py-2.5 text-sm outline-none transition placeholder:text-sage/70 focus:border-forest focus:ring-4 focus:ring-forest/10"
        />

        <ul className="mt-4 space-y-3">
          {visible.length === 0 && report !== null ? (
            <li>
              <EmptyState
                title={hasCv ? "Aucune offre ici" : "Pas encore de CV"}
                text={
                  hasCv
                    ? filter === "all"
                      ? "Aucune offre publiée pour le moment."
                      : "Aucune offre dans cet onglet."
                    : "Déposez un CV, ou créez-le dans le créateur, pour voir les offres qui vous correspondent."
                }
                href={hasCv ? undefined : "/candidat/cv-builder"}
                cta={hasCv ? undefined : "Créer mon CV"}
              />
            </li>
          ) : null}
          {visible.map((item) => {
            const rewrite = rewrites[item.job.id];
            const open = openJob === item.job.id;
            const tone = matchTone(item.score);
            return (
              <li key={item.job.id}>
                <Card className="p-4 sm:p-5">
                  <div className="flex items-start gap-4">
                    <ScoreRing value={item.score} size={56} label={`Correspondance ${item.score} %`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-sage">
                        {item.job.company}
                        {` · ${item.job.location}`}
                        {item.job.remote ? " · Remote" : ""}
                      </p>
                      <Link href={`/offres/${item.job.id}`} className="mt-0.5 block text-base font-semibold leading-snug hover:underline">
                        {item.job.title}
                      </Link>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <Pill tone={tone.pill}>{tone.label}</Pill>
                        {item.applied ? <Pill tone="info">{item.applicationStage ? (STAGE_LABEL[item.applicationStage] ?? item.applicationStage) : "Postulé"}</Pill> : null}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {item.matchedKeywords.map((skill) => (
                      <Pill key={`ok-${skill}`} tone="good">
                        ✓ {skill}
                      </Pill>
                    ))}
                    {item.missingKeywords.map((skill) => (
                      <Pill key={`miss-${skill}`} tone="warn">
                        {skill}
                      </Pill>
                    ))}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-sage">
                    {item.missingKeywords.length
                      ? `À ajouter seulement si vous les avez pratiquées : ${item.missingKeywords.join(", ")}.`
                      : "Les compétences demandées sont déjà dans le CV."}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button type="button" disabled={item.applied || busyJob === item.job.id} onClick={() => void apply(item.job.id)} className={primaryButton}>
                      {item.applied ? "Déjà postulé" : busyJob === item.job.id && !open ? "Envoi…" : "Postuler"}
                    </button>
                    <button type="button" aria-expanded={open} onClick={() => void optimize(item.job.id)} className={ghostButton}>
                      {open ? "Masquer" : "Adapter à cette offre"}
                    </button>
                    <Link href="/candidat/entretien" className="rounded-full px-3 py-2 text-sm font-medium text-sage hover:text-forest">
                      Simuler l&apos;entretien
                    </Link>
                  </div>

                  {open ? (
                    <div className="mt-3 rounded-2xl bg-paper p-4">
                      {busyJob === item.job.id && !rewrite ? (
                        <p className="text-sm text-sage">Préparation des puces…</p>
                      ) : rewrite ? (
                        <>
                          <p className="font-semibold">{rewrite.headline}</p>
                          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6">
                            {rewrite.bullets.map((bullet) => (
                              <li key={bullet}>{bullet}</li>
                            ))}
                          </ul>
                          {rewrite.warning ? <p className="mt-3 text-sm text-warn">{rewrite.warning}</p> : null}
                          <button type="button" onClick={() => void copyText(item.job.id, [rewrite.headline, ...rewrite.bullets].join("\n"))} className={`${primaryButton} mt-3`}>
                            {copied === item.job.id ? "Copié ✓" : "Copier"}
                          </button>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ul>
      </div>
    </AppShell>
  );
}

function matchTone(score: number): { label: string; pill: "good" | "warn" | "info" } {
  if (score >= 70) return { label: "Bon match", pill: "good" };
  if (score >= 50) return { label: "À renforcer", pill: "info" };
  return { label: "Écart", pill: "warn" };
}

function MiniStat({ label, value, suffix = "" }: { label: string; value?: number | null; suffix?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white px-4 py-3">
      <p className="text-xs text-sage">{label}</p>
      <p className="mt-0.5 text-2xl font-bold">
        {value ?? "—"}
        {value != null ? suffix : ""}
      </p>
    </div>
  );
}
