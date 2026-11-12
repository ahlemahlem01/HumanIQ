"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card, EmptyState, PageHeader, Pill, primaryButton, scoreTone, Skeleton } from "@/components/candidate-ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Session = {
  id: string;
  kind: string;
  status: string;
  overallScore: number | null;
  job: { title: string } | null;
  createdAt: string;
};

type Application = { id: string; job: { id: string; title: string } };

export default function InterviewHubPage() {
  const { token } = useAuth();
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [apps, setApps] = useState<Application[]>([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState("");

  useEffect(() => {
    if (!token) return;
    api<Session[]>("/interviews", { token }).then(setSessions).catch(() => setSessions([]));
    api<Application[]>("/applications/mine", { token }).then(setApps).catch(() => setApps([]));
  }, [token]);

  async function start(key: string, body: { jobId?: string; applicationId?: string }) {
    if (!token || pending) return;
    setPending(key);
    setError("");
    try {
      const session = await api<{ id: string }>("/interviews", { token, body });
      router.push(`/candidat/entretien/${session.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de démarrer.");
      setPending("");
    }
  }

  const finished = (sessions ?? []).filter((session) => session.status === "COMPLETED" && session.overallScore != null);
  const average = finished.length ? Math.round(finished.reduce((total, session) => total + (session.overallScore ?? 0), 0) / finished.length) : null;
  const ongoing = (sessions ?? []).filter((session) => session.status !== "COMPLETED");

  return (
    <AppShell role="CANDIDATE" plain>
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Entretien" intro="Cinq questions, une réponse à la fois. Vous recevez un score et un retour après chaque envoi." />

        <Card className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-semibold">Entraînement libre</h2>
            <p className="mt-0.5 text-sm text-sage">Des questions générales adaptées à votre profil, sans enjeu.</p>
          </div>
          <button type="button" disabled={pending !== ""} onClick={() => void start("free", {})} className={primaryButton}>
            {pending === "free" ? "Préparation…" : ongoing.length ? "Nouvel entraînement" : "Commencer"}
          </button>
        </Card>

        {error ? (
          <p role="alert" className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-warn">
            {error}
          </p>
        ) : null}

        {sessions && sessions.length > 0 ? (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-line bg-white px-4 py-3">
              <p className="text-xs text-sage">Entretiens terminés</p>
              <p className="mt-0.5 text-2xl font-bold">{finished.length}</p>
            </div>
            <div className="rounded-2xl border border-line bg-white px-4 py-3">
              <p className="text-xs text-sage">Score moyen</p>
              <p className="mt-0.5 text-2xl font-bold">{average !== null ? `${average} %` : "—"}</p>
            </div>
          </div>
        ) : null}

        {apps.length > 0 ? (
          <section className="mt-8" aria-labelledby="apps-title">
            <h2 id="apps-title" className="text-lg font-semibold">
              Se préparer pour une candidature
            </h2>
            <p className="mt-1 text-sm text-sage">Les questions reprennent les compétences de l&apos;offre.</p>
            <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-white">
              {apps.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="min-w-0 truncate text-sm font-medium">{item.job.title}</span>
                  <button
                    type="button"
                    disabled={pending !== ""}
                    onClick={() => void start(item.id, { applicationId: item.id, jobId: item.job.id })}
                    className="shrink-0 rounded-full border border-forest px-3 py-1 text-xs font-semibold text-forest transition hover:bg-tint active:scale-95 disabled:opacity-50"
                  >
                    {pending === item.id ? "Préparation…" : "Lancer"}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="mt-8" aria-labelledby="history-title">
          <h2 id="history-title" className="text-lg font-semibold">
            Historique
          </h2>
          <div className="mt-3">
            {sessions === null ? <Skeleton className="h-24" /> : null}
            {sessions && sessions.length === 0 ? (
              <EmptyState title="Aucun entretien pour l'instant" text="Lancez un premier entraînement : cela prend une dizaine de minutes et vous donne un retour question par question." />
            ) : null}
            {sessions && sessions.length > 0 ? (
              <ul className="divide-y divide-line rounded-2xl border border-line bg-white">
                {sessions.map((session) => {
                  const done = session.status === "COMPLETED";
                  return (
                    <li key={session.id}>
                      <Link href={`/candidat/entretien/${session.id}`} className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-paper/60">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{session.job?.title ?? "Entraînement libre"}</p>
                          <p className="text-xs text-sage">
                            {session.kind === "SCREENING" ? "Candidature" : "Entraînement"} · {new Date(session.createdAt).toLocaleDateString("fr-FR")}
                          </p>
                        </div>
                        {done && session.overallScore != null ? <Pill tone={scoreTone(session.overallScore)}>{session.overallScore} %</Pill> : <Pill tone="warn">Reprendre</Pill>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
