"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Session = {
  id: string;
  status: string;
  currentIndex: number;
  total: number;
  overallScore: number | null;
  summary: string | null;
  job: { title: string } | null;
  history: {
    index: number;
    competency: string;
    question: string;
    answer: string | null;
    score: number | null;
    feedback: string | null;
  }[];
  current: { index: number; competency: string; question: string } | null;
};

export default function InterviewRoomPage() {
  const params = useParams<{ id: string }>();
  const { token } = useAuth();
  const [session, setSession] = useState<Session | null>(null);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!token) return;
    api<Session>(`/interviews/${params.id}`, { token }).then(setSession);
  }, [token, params.id]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const text = answer.trim();
    setPending(true);
    setError("");
    try {
      setSession(await api<Session>(`/interviews/${params.id}/answer`, { token, body: { text } }));
      setAnswer("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Envoi impossible.");
    } finally {
      setPending(false);
    }
  }

  if (!session) {
    return <AppShell role="CANDIDATE" plain><p className="text-sm text-sage">Chargement…</p></AppShell>;
  }

  const step = Math.min(session.currentIndex + 1, session.total);
  const done = session.history.length;

  return (
    <AppShell role="CANDIDATE" plain>
      <div className="mx-auto max-w-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs text-sage">{session.job?.title ?? "Entraînement libre"}</p>
            <h1 className="mt-1 text-lg font-semibold">
              {session.current ? `Question ${step} sur ${session.total}` : "Entretien terminé"}
            </h1>
          </div>
          <Link href="/candidat/entretien" className="text-xs text-sage hover:underline">
            Retour
          </Link>
        </div>

        <div className="mt-4 flex gap-1.5" aria-hidden>
          {Array.from({ length: session.total }, (_, index) => (
            <span
              key={index}
              className={`h-1.5 flex-1 rounded-full ${index < done ? "bg-forest" : index === done && session.current ? "bg-forest/40" : "bg-line"}`}
            />
          ))}
        </div>

        {session.current ? (
          <form onSubmit={onSubmit} className="mt-6 rounded-2xl border border-line bg-cream p-5">
            <span className="rounded-full bg-paper px-2.5 py-0.5 text-xs font-medium">{readable(session.current.competency)}</span>
            <p className="mt-3 text-base font-semibold leading-6">{session.current.question}</p>
            <textarea
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              required
              minLength={20}
              rows={8}
              placeholder="Contexte, ce que vous avez décidé, et le résultat."
              className="mt-4 min-h-44 w-full rounded-xl border border-line bg-paper p-3 text-sm outline-none ring-forest focus:ring-2"
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-xs text-sage">{answer.trim().length < 20 ? "Au moins quelques phrases." : "Prêt à envoyer."}</p>
              <button
                disabled={pending || answer.trim().length < 20}
                className="rounded-full bg-forest px-4 py-2 text-sm font-semibold text-cream disabled:opacity-50"
              >
                {pending ? "Évaluation…" : "Envoyer"}
              </button>
            </div>
            {error ? <p className="mt-2 text-sm text-warn">{error}</p> : null}
          </form>
        ) : (
          <section className="mt-6 rounded-2xl border border-line bg-cream p-5">
            <p className="text-xs text-sage">Score global</p>
            <p className="mt-1 text-lg font-semibold">{session.overallScore ?? "—"}%</p>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{session.summary}</p>
            <Link href="/candidat/entretien" className="mt-4 inline-block rounded-lg bg-forest px-3 py-1.5 text-xs font-semibold text-cream">
              Nouvel entretien
            </Link>
          </section>
        )}

        {session.history.length ? (
          <section className="mt-8">
            <h2 className="text-sm font-semibold">Déjà répondu</h2>
            <ol className="mt-3 space-y-3">
              {session.history.map((turn) => (
                <li key={turn.index} className="rounded-xl border border-line bg-cream px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-sage">
                      {turn.index + 1}. {readable(turn.competency)}
                    </p>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${scorePill(turn.score)}`}>
                      {turn.score ?? "—"}%
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-medium">{turn.question}</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-sage">{turn.answer}</p>
                  {turn.feedback ? <p className="mt-2 text-sm">{turn.feedback}</p> : null}
                </li>
              ))}
            </ol>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}

function readable(value: string) {
  if (value.length > 3 && value === value.toUpperCase()) return value.charAt(0) + value.slice(1).toLowerCase();
  return value;
}

function scorePill(score: number | null) {
  if (score == null) return "bg-paper text-sage";
  if (score >= 70) return "bg-[#e7f6ee] text-[#145c40]";
  return "bg-[#fff4e5] text-warn";
}
