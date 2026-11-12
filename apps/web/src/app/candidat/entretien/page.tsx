"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
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
  const [sessions, setSessions] = useState<Session[]>([]);
  const [apps, setApps] = useState<Application[]>([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!token) return;
    api<Session[]>("/interviews", { token }).then(setSessions).catch(() => setSessions([]));
    api<Application[]>("/applications/mine", { token }).then(setApps).catch(() => setApps([]));
  }, [token]);

  async function start(body: { jobId?: string; applicationId?: string }) {
    if (!token) return;
    setPending(true);
    setError("");
    try {
      const session = await api<{ id: string }>("/interviews", { token, body });
      router.push(`/candidat/entretien/${session.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de démarrer.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AppShell role="CANDIDATE" plain>
      <div className="mx-auto max-w-2xl">
        <h1 className="text-lg font-semibold">Entretien</h1>
        <p className="mt-1 text-sm text-sage">Cinq questions, une réponse à la fois. Vous recevez un score et un retour après chaque envoi.</p>
        <button
          disabled={pending}
          onClick={() => start({})}
          className="mt-5 rounded-full bg-forest px-4 py-2 text-sm font-semibold text-cream disabled:opacity-60"
        >
          {pending ? "Préparation…" : "Commencer un entraînement"}
        </button>

        {apps.length ? (
          <section className="mt-8">
            <h2 className="text-sm font-semibold">À partir d&apos;une candidature</h2>
            <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-cream">
              {apps.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="text-sm">{item.job.title}</span>
                  <button
                    disabled={pending}
                    onClick={() => start({ applicationId: item.id, jobId: item.job.id })}
                    className="rounded-lg bg-forest px-3 py-1.5 text-xs font-semibold text-cream disabled:opacity-60"
                  >
                    Lancer
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {error ? <p className="mt-4 text-sm text-warn">{error}</p> : null}

        <section className="mt-8">
          <h2 className="text-sm font-semibold">Historique</h2>
          <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-cream">
            {sessions.length === 0 ? (
              <li className="px-4 py-4 text-sm text-sage">Aucun entretien pour l&apos;instant.</li>
            ) : (
              sessions.map((session) => (
                <li key={session.id}>
                  <Link href={`/candidat/entretien/${session.id}`} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium">{session.job?.title ?? "Entraînement libre"}</p>
                      <p className="text-xs text-sage">
                        {session.kind === "SCREENING" ? "Candidature" : "Entraînement"}
                        {" · "}
                        {session.status === "COMPLETED" ? "Terminé" : "En cours"}
                      </p>
                    </div>
                    <p className="text-sm font-semibold">
                      {session.overallScore != null ? `${session.overallScore}%` : "En cours"}
                    </p>
                  </Link>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
