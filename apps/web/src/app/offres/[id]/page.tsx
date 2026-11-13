"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CompanyLogo } from "@/components/company-logo";
import { MatchInsight } from "@/components/match-insight";
import { SiteHeader } from "@/components/site-header";
import { api } from "@/lib/api";
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
  requiredSkills: string[];
  company: { name: string; description: string | null; logoUrl?: string | null };
};

type Match = {
  score: number;
  semanticScore: number | null;
  keywordScore: number;
  matchedKeywords: string[];
  missingKeywords: string[];
  similarity: number | null;
  method: string;
  model: string | null;
};

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const { user, token } = useAuth();
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null);
  const [match, setMatch] = useState<Match | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Job>(`/jobs/${params.id}`).then(setJob);
  }, [params.id]);

  useEffect(() => {
    if (user?.role === "CANDIDATE" && token) {
      api<Match>(`/ai/match/${params.id}`, { token }).then(setMatch).catch(() => setMatch(null));
    }
  }, [user, token, params.id]);

  async function apply() {
    if (!token) {
      router.push("/login");
      return;
    }
    try {
      await api("/applications", { token, body: { jobId: params.id } });
      setMessage("Candidature envoyée. Elle apparaît dans le pipeline du recruteur.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Impossible de postuler.");
    }
  }

  async function loadFeedback() {
    if (!token) return;
    setBusy(true);
    try {
      const result = await api<{ feedback: string }>(`/ai/feedback/${params.id}`, { token });
      setFeedback(result.feedback);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Feedback indisponible.");
    } finally {
      setBusy(false);
    }
  }

  if (!job) return <p className="p-10 text-sm text-sage">Chargement…</p>;

  const pay =
    job.salaryMin != null
      ? `${job.salaryMin.toLocaleString("fr-FR")}${job.salaryMax ? ` – ${job.salaryMax.toLocaleString("fr-FR")}` : ""}`
      : null;

  return (
    <div className="min-h-screen bg-paper">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 py-8">
        <Link href="/offres" className="text-sm font-medium text-forest hover:underline">
          ← Retour aux offres
        </Link>
        <div className="mt-4 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <article className="rounded-2xl border border-line bg-white p-8">
            <p className="flex items-center gap-3 text-sm font-medium text-forest">
              <CompanyLogo company={job.company} className="h-10 w-10 rounded-lg text-xs" />
              {job.company.name}
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">{job.title}</h1>
            <div className="mt-4 flex flex-wrap gap-2 text-sm">
              <span className="rounded-full bg-tint px-3 py-1 font-medium text-forest">{job.contractType}</span>
              <span className="rounded-full bg-paper px-3 py-1">{job.location}</span>
              {job.remote ? <span className="rounded-full bg-paper px-3 py-1">Télétravail</span> : null}
              {pay ? <span className="rounded-full bg-paper px-3 py-1">{pay} / an</span> : null}
            </div>
            <hr className="my-6 border-line" />
            <h2 className="text-lg font-semibold">Description</h2>
            <p className="mt-3 whitespace-pre-wrap leading-7 text-ink/90">{job.description}</p>
            {job.requiredSkills.length > 0 ? (
              <>
                <h2 className="mt-8 text-lg font-semibold">Compétences demandées</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {job.requiredSkills.map((skill) => (
                    <span key={skill} className="rounded-full bg-tint px-3 py-1.5 text-sm font-medium text-forest">
                      {skill}
                    </span>
                  ))}
                </div>
              </>
            ) : null}
          </article>

          <aside className="space-y-4 lg:sticky lg:top-20">
            <section className="rounded-2xl border border-line bg-white p-6">
              <button
                onClick={apply}
                className="w-full rounded-full bg-forest py-3.5 text-sm font-semibold text-white"
              >
                Postuler maintenant
              </button>
              {user?.role === "CANDIDATE" ? (
                <button
                  onClick={loadFeedback}
                  disabled={busy}
                  className="mt-2 w-full rounded-full border border-forest py-3 text-sm font-semibold text-forest disabled:opacity-60"
                >
                  {busy ? "Rédaction…" : "Feedback carrière IA"}
                </button>
              ) : null}
              {message ? <p className="mt-3 text-sm text-forest">{message}</p> : null}
              {feedback ? (
                <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-paper p-3 text-xs leading-relaxed text-ink/80">
                  {feedback}
                </pre>
              ) : null}
            </section>

            {match ? (
              <MatchInsight match={match} />
            ) : (
              <section className="rounded-2xl border border-line bg-white p-6">
                <p className="text-sm leading-6 text-sage">
                  {user?.role === "CANDIDATE"
                    ? "Analyse de votre compatibilité en cours…"
                    : "Connectez-vous en candidat pour voir votre score de compatibilité avec cette offre."}
                </p>
              </section>
            )}

            <section className="rounded-2xl border border-line bg-white p-6">
              <h2 className="text-sm font-semibold">À propos de l&apos;entreprise</h2>
              <div className="mt-2 flex items-center gap-3">
                <CompanyLogo company={job.company} className="h-12 w-12 rounded-lg text-sm" />
                <p className="text-lg font-semibold">{job.company.name}</p>
              </div>
              {job.company.description ? (
                <p className="mt-2 text-sm leading-6 text-sage">{job.company.description}</p>
              ) : null}
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}

function ScoreChip({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | null;
  hint?: string;
}) {
  return (
    <div className="rounded-xl bg-paper px-3 py-2">
      <p className="text-sage">{label}</p>
      <p className="text-lg font-semibold">{value ?? "—"}{value != null ? "%" : ""}</p>
      {hint ? <p className="text-[10px] text-forest/40">{hint}</p> : null}
    </div>
  );
}
