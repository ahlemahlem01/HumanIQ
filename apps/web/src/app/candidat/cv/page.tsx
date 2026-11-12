"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
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
    ingest("file", () => upload("/ai/cv/upload", file, { token }));
  }

  function onPaste(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const cvText = String(new FormData(event.currentTarget).get("cvText"));
    ingest("text", () => api("/ai/parse-cv", { token, body: { cvText } }));
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
    await navigator.clipboard.writeText(text);
    setCopied(key);
    window.setTimeout(() => setCopied((current) => (current === key ? null : current)), 1600);
  }

  const dossier = report?.dossier;
  const matches = report?.matches ?? [];
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
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold">Votre CV</h1>
            <p className="mt-1 text-sm text-sage">
              Voyez les offres qui vous correspondent, puis renforcez le CV pour chacune. Rien n&apos;est inventé.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Link href="/candidat/ats" className="rounded-lg border border-forest px-3 py-1.5 text-xs font-semibold">
              Analyse ATS
            </Link>
            <Link href="/candidat/cv-builder" className="rounded-lg bg-forest px-3 py-1.5 text-xs font-semibold text-cream">
              Créer un CV
            </Link>
          </div>
        </div>

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
          className={`mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed px-4 py-4 ${
            dragOver ? "border-forest bg-cream" : "border-line bg-cream"
          }`}
        >
          <div>
            <p className="text-sm font-semibold">{hasCv ? "Remplacer le CV" : "Déposez votre CV"}</p>
            <p className="mt-0.5 text-xs text-sage">PDF, Word ou texte · 8 Mo max</p>
          </div>
          <div className="flex flex-wrap gap-2">
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
            <button
              type="button"
              disabled={pending !== null}
              onClick={() => fileInput.current?.click()}
              className="rounded-lg bg-forest px-3 py-1.5 text-xs font-semibold text-cream disabled:opacity-60"
            >
              {pending === "file" ? "Lecture…" : "Choisir un fichier"}
            </button>
          </div>
        </section>

        <details className="mt-2 rounded-xl border border-line bg-cream px-4 py-3">
          <summary className="cursor-pointer text-sm">Coller le texte du CV</summary>
          <form onSubmit={onPaste} className="mt-3">
            <textarea
              name="cvText"
              required
              minLength={40}
              rows={6}
              placeholder="Expérience, compétences, réalisations…"
              className="w-full rounded-2xl border border-line bg-paper p-3 text-sm"
            />
            <button
              disabled={pending !== null}
              className="mt-3 rounded-lg bg-forest px-3 py-1.5 text-xs font-semibold text-cream disabled:opacity-60"
            >
              {pending === "text" ? "Analyse…" : "Analyser ce texte"}
            </button>
          </form>
        </details>

        {error ? <p className="mt-3 text-sm text-warn">{error}</p> : null}

        {dossier && hasCv ? (
          <section className="mt-4 rounded-xl border border-line bg-cream px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{dossier.headline || "CV importé"}</p>
                <p className="mt-1 text-xs text-sage">
                  {dossier.cvFileName ?? "Texte collé"}
                  {dossier.cvPageCount ? ` · ${dossier.cvPageCount} p.` : ""}
                  {` · ${dossier.experienceYears} ans`}
                  {dossier.location ? ` · ${dossier.location}` : ""}
                </p>
              </div>
              {dossier.skills.length ? (
                <button
                  type="button"
                  onClick={() => copyText("skills", dossier.skills.join(" · "))}
                  className="shrink-0 rounded-full border border-line px-3 py-1.5 text-xs font-semibold"
                >
                  {copied === "skills" ? "Copié" : "Copier les compétences"}
                </button>
              ) : null}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {dossier.skills.length ? (
                dossier.skills.map((skill) => (
                  <span key={skill} className="rounded-full bg-paper px-2.5 py-0.5 text-xs font-medium">
                    {skill}
                  </span>
                ))
              ) : (
                <span className="text-sm text-sage">Aucune compétence reconnue. Vérifiez le CV.</span>
              )}
            </div>
          </section>
        ) : null}

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MiniStat label="Meilleur match" value={report?.stats.bestScore} suffix="%" />
          <MiniStat label="Moyenne" value={report?.stats.averageScore} suffix="%" />
          <MiniStat label="Prêtes à postuler" value={report?.stats.readyCount} />
          <MiniStat label="À renforcer" value={report?.stats.gapCount} />
        </div>

        <div className="mt-6 flex gap-5 overflow-x-auto border-b border-line text-sm">
          {(
            [
              ["all", "Toutes"],
              ["ready", "Bonnes"],
              ["optimize", "À renforcer"],
              ["gap", "Écarts"],
              ["applied", "Postulées"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`-mb-px shrink-0 border-b-2 pb-2 ${filter === id ? "border-forest font-semibold" : "border-transparent text-sage"}`}
            >
              {label} ({filterCounts[id]})
            </button>
          ))}
        </div>

        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Rechercher une offre"
          className="mt-4 w-full rounded-full border border-line bg-cream px-4 py-2.5 text-sm outline-none ring-forest focus:ring-2"
        />

        <ul className="mt-2 divide-y divide-line">
          {visible.length === 0 ? (
            <li className="py-8 text-sm text-sage">
              {hasCv
                ? filter === "all"
                  ? "Aucune offre publiée pour le moment."
                  : "Aucune offre dans cet onglet."
                : "Déposez un CV pour voir les offres qui vous correspondent."}
            </li>
          ) : (
            visible.map((item) => {
              const rewrite = rewrites[item.job.id];
              const open = openJob === item.job.id;
              const tone = scoreTone(item.score);
              return (
                <li key={item.job.id} className="py-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs text-sage">
                        {item.job.company}
                        {` · ${item.job.location}`}
                        {item.job.remote ? " · Remote" : ""}
                        {item.applied && item.applicationStage
                          ? ` · ${STAGE_LABEL[item.applicationStage] ?? item.applicationStage}`
                          : ""}
                      </p>
                      <Link href={`/offres/${item.job.id}`} className="mt-1 block text-base font-semibold hover:underline">
                        {item.job.title}
                      </Link>
                    </div>
                    <p className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${tone.pill}`}>
                      {item.score}% · {tone.label}
                    </p>
                  </div>

                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-paper">
                    <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${Math.min(100, Math.max(0, item.score))}%` }} />
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {item.matchedKeywords.map((skill) => (
                      <span key={`ok-${skill}`} className="rounded-full bg-[#e7f6ee] px-2.5 py-0.5 text-xs text-[#145c40]">
                        {skill}
                      </span>
                    ))}
                    {item.missingKeywords.map((skill) => (
                      <span key={`miss-${skill}`} className="rounded-full bg-[#fff4e5] px-2.5 py-0.5 text-xs text-warn">
                        {skill}
                      </span>
                    ))}
                  </div>
                  <p className="mt-2 text-sm text-sage">
                    {item.missingKeywords.length
                      ? `À ajouter seulement si vous les avez pratiquées : ${item.missingKeywords.join(", ")}.`
                      : "Les compétences demandées sont déjà dans le CV."}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={item.applied || busyJob === item.job.id}
                      onClick={() => apply(item.job.id)}
                      className="rounded-lg bg-forest px-3 py-1.5 text-xs font-semibold text-cream disabled:opacity-50"
                    >
                      {item.applied ? "Déjà postulé" : busyJob === item.job.id && !open ? "Envoi…" : "Postuler"}
                    </button>
                    <button
                      type="button"
                      onClick={() => optimize(item.job.id)}
                      className="rounded-lg border border-forest px-3 py-1.5 text-xs font-semibold"
                    >
                      {open ? "Masquer" : "Adapter à cette offre"}
                    </button>
                    <Link href="/candidat/entretien" className="rounded-full px-3 py-1.5 text-xs text-sage">
                      Simuler l&apos;entretien
                    </Link>
                  </div>

                  {open ? (
                    <div className="mt-3 rounded-3xl bg-paper p-4">
                      {busyJob === item.job.id && !rewrite ? (
                        <p className="text-sm text-sage">Préparation des puces…</p>
                      ) : rewrite ? (
                        <>
                          <p className="text-sm font-semibold">{rewrite.headline}</p>
                          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                            {rewrite.bullets.map((bullet) => (
                              <li key={bullet}>{bullet}</li>
                            ))}
                          </ul>
                          {rewrite.warning ? <p className="mt-3 text-sm text-warn">{rewrite.warning}</p> : null}
                          <button
                            type="button"
                            onClick={() => copyText(item.job.id, [rewrite.headline, ...rewrite.bullets].join("\n"))}
                            className="mt-3 rounded-lg bg-forest px-3 py-1.5 text-xs font-semibold text-cream"
                          >
                            {copied === item.job.id ? "Copié" : "Copier"}
                          </button>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })
          )}
        </ul>
      </div>
    </AppShell>
  );
}

function scoreTone(score: number) {
  if (score >= 70) return { label: "Bon match", bar: "bg-good", pill: "bg-[#e7f6ee] text-[#145c40]" };
  if (score >= 50) return { label: "À renforcer", bar: "bg-warn", pill: "bg-[#fff4e5] text-warn" };
  return { label: "Écart", bar: "bg-warn", pill: "bg-[#fff4e5] text-warn" };
}

function MiniStat({ label, value, suffix = "" }: { label: string; value?: number | null; suffix?: string }) {
  return (
    <div className="rounded-xl border border-line bg-cream px-3 py-3">
      <p className="text-xs text-sage">{label}</p>
      <p className="mt-1 text-lg font-semibold">
        {value ?? "—"}
        {value != null ? suffix : ""}
      </p>
    </div>
  );
}
