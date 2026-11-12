"use client";

import { useParams } from "next/navigation";
import { FormEvent, KeyboardEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card, ghostButton, PageHeader, Pill, primaryButton, ScoreRing, Skeleton } from "@/components/candidate-ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Question = {
  id: string;
  competency: string;
  prompt: string;
  choices: string[];
  correctIndex?: number;
};

type CaseResult = { id: string; ok: boolean; public: boolean; error?: string };

type Challenge = {
  id: string;
  title: string;
  competency: string;
  prompt: string;
  starter: string;
  functionName: string;
  source?: string;
  publicTests: { id: string; args: unknown[]; expected: unknown }[];
};

type Assessment = {
  id: string;
  title: string;
  status: string;
  score: number | null;
  jobTitle?: string;
  kind?: "code" | "mcq";
  questions: Question[];
  answers?: number[];
  challenges?: Challenge[];
  reports?: { challengeId: string; passed: number; total: number; results: CaseResult[] }[];
};

export default function TestTakePage() {
  const params = useParams<{ id: string }>();
  const { token } = useAuth();
  const [test, setTest] = useState<Assessment | null>(null);

  useEffect(() => {
    if (!token) return;
    api<Assessment>(`/assessments/${params.id}`, { token }).then(setTest);
  }, [token, params.id]);

  if (!test) {
    return (
      <AppShell role="CANDIDATE" plain>
        <div className="mx-auto max-w-3xl space-y-4">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-48" />
        </div>
      </AppShell>
    );
  }
  if (test.kind === "code" || (test.challenges && test.challenges.length > 0)) {
    return <CodeLab test={test} token={token} onUpdate={setTest} />;
  }
  return <McqLab test={test} token={token} onUpdate={setTest} />;
}

function CodeLab({
  test,
  token,
  onUpdate,
}: {
  test: Assessment;
  token: string | null;
  onUpdate: (test: Assessment) => void;
}) {
  const [sources, setSources] = useState<Record<string, string>>(() =>
    Object.fromEntries((test.challenges ?? []).map((item) => [item.id, item.source ?? item.starter])),
  );
  const [runs, setRuns] = useState<Record<string, { passed: number; total: number; results: CaseResult[] }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const done = test.status === "COMPLETED";

  async function run(challengeId: string) {
    if (!token) return;
    setBusy(challengeId);
    setError("");
    try {
      const result = await api<{ passed: number; total: number; results: CaseResult[] }>(
        `/assessments/${test.id}/run`,
        { token, body: { challengeId, source: sources[challengeId] ?? "" } },
      );
      setRuns((current) => ({ ...current, [challengeId]: result }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Exécution impossible.");
    } finally {
      setBusy(null);
    }
  }

  async function submit() {
    if (!token) return;
    setBusy("submit");
    setError("");
    try {
      onUpdate(await api<Assessment>(`/assessments/${test.id}/submit`, { token, body: { code: sources } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Soumission impossible.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <AppShell role="CANDIDATE" plain>
      <div className="mx-auto max-w-3xl">
      <PageHeader
        title={test.title}
        intro={`${test.jobTitle ? `${test.jobTitle} · ` : ""}JavaScript. Votre code s'exécute dans un bac à sable isolé (400 ms maximum par test).`}
        action={done && test.score != null ? <ScoreRing value={test.score} size={72} label={`Résultat ${test.score} %`} /> : null}
      />
      <div className="space-y-5">
        {(test.challenges ?? []).map((challenge, challengeIndex) => {
          const runResult = runs[challenge.id];
          const submitted = test.reports?.find((item) => item.challengeId === challenge.id);
          const results = submitted?.results ?? runResult?.results;
          return (
            <Card key={challenge.id}>
              <div className="flex items-center gap-2">
                <Pill tone="info">Exercice {challengeIndex + 1}</Pill>
                <Pill tone="neutral">{challenge.competency}</Pill>
              </div>
              <h2 className="mt-2 text-lg font-semibold">{challenge.title}</h2>
              <p className="mt-1.5 text-sm leading-6 text-sage">{challenge.prompt}</p>
              <div className="mt-3 rounded-xl bg-paper px-3 py-2 font-mono text-xs leading-5 text-sage">
                <p className="mb-1 font-sans font-semibold text-ink">Exemples</p>
                {challenge.publicTests.map((item) => (
                  <p key={item.id} className="break-words">
                    {challenge.functionName}({item.args.map(preview).join(", ")}) → {preview(item.expected)}
                  </p>
                ))}
              </div>
              <textarea
                value={sources[challenge.id] ?? ""}
                disabled={done}
                spellCheck={false}
                onKeyDown={(event) => onTab(event, challenge.id, sources, setSources)}
                onChange={(event) =>
                  setSources((current) => ({ ...current, [challenge.id]: event.target.value }))
                }
                rows={12}
                aria-label={`Code de l'exercice ${challengeIndex + 1}`}
                className="mt-4 w-full resize-y rounded-xl border border-line bg-paper p-3 font-mono text-sm leading-6 outline-none transition focus:border-forest focus:ring-4 focus:ring-forest/10 disabled:opacity-80"
              />
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {!done ? (
                  <button type="button" disabled={busy !== null} onClick={() => run(challenge.id)} className={ghostButton}>
                    {busy === challenge.id ? "Exécution…" : "Lancer les exemples"}
                  </button>
                ) : null}
                {runResult ? (
                  <Pill tone={runResult.passed === runResult.total ? "good" : "warn"}>
                    Exemples : {runResult.passed}/{runResult.total}
                  </Pill>
                ) : null}
                {submitted ? (
                  <Pill tone={submitted.passed === submitted.total ? "good" : "warn"}>
                    Tous les tests : {submitted.passed}/{submitted.total}
                  </Pill>
                ) : null}
              </div>
              {results?.length ? (
                <ul className="mt-3 space-y-1.5 text-sm" aria-label="Résultats des tests">
                  {results.map((item) => (
                    <li key={item.id} className={`flex flex-wrap items-baseline gap-2 ${item.ok ? "text-good" : "text-red-700"}`}>
                      <span aria-hidden>{item.ok ? "✓" : "✗"}</span>
                      <span className="font-medium">{item.ok ? "Réussi" : "Échec"}</span>
                      <span className="text-sage">
                        · {item.public ? "exemple" : "test caché"} {item.id}
                        {item.error ? ` — ${item.error}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Card>
          );
        })}
        {!done ? (
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" disabled={busy !== null} onClick={submit} className={primaryButton}>
              {busy === "submit" ? "Correction…" : "Rendre le test"}
            </button>
            <p className="text-xs text-sage">Les tests cachés sont exécutés à ce moment. Une fois rendu, le test ne peut plus être modifié.</p>
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}
      </div>
      </div>
    </AppShell>
  );
}

function McqLab({
  test,
  token,
  onUpdate,
}: {
  test: Assessment;
  token: string | null;
  onUpdate: (test: Assessment) => void;
}) {
  const [picks, setPicks] = useState<number[]>(test.answers ?? Array(test.questions.length).fill(-1));
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const done = test.status === "COMPLETED";
  const answered = picks.filter((value) => value >= 0).length;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    if (picks.some((value) => value < 0)) {
      setError("Répondez à toutes les questions.");
      return;
    }
    setPending(true);
    setError("");
    try {
      onUpdate(await api<Assessment>(`/assessments/${test.id}/submit`, { token, body: { answers: picks } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Soumission impossible.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AppShell role="CANDIDATE" plain>
      <div className="mx-auto max-w-3xl">
        <PageHeader
          title={test.title}
          intro={test.jobTitle ?? undefined}
          action={done && test.score != null ? <ScoreRing value={test.score} size={72} label={`Résultat ${test.score} %`} /> : null}
        />
        {!done ? (
          <div className="mb-5" aria-live="polite">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">
                {answered} réponse{answered > 1 ? "s" : ""} sur {test.questions.length}
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={answered} aria-valuemin={0} aria-valuemax={test.questions.length}>
              <div className="h-full rounded-full bg-forest transition-all duration-500" style={{ width: `${(answered / Math.max(1, test.questions.length)) * 100}%` }} />
            </div>
          </div>
        ) : null}
        {done && test.questions.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line bg-paper/60 px-5 py-6 text-sm leading-6 text-sage">
            Test terminé : votre résultat est enregistré et visible par le recruteur. Le détail des questions n&apos;est plus affiché.
          </p>
        ) : null}
        <form onSubmit={onSubmit} className="space-y-5">
          {test.questions.map((question, index) => (
            <fieldset key={question.id} className="rounded-2xl border border-line bg-white p-5">
              <legend className="sr-only">Question {index + 1}</legend>
              <div className="flex items-center gap-2">
                <Pill tone="info">Question {index + 1}</Pill>
                <Pill tone="neutral">{question.competency}</Pill>
              </div>
              <p className="mt-2 font-semibold leading-6">{question.prompt}</p>
              <ul className="mt-3 space-y-2">
                {question.choices.map((choice, choiceIndex) => {
                  const selected = picks[index] === choiceIndex;
                  const correct = done && question.correctIndex === choiceIndex;
                  const wrong = done && selected && question.correctIndex !== choiceIndex;
                  return (
                    <li key={choice}>
                      <label
                        className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-2.5 text-sm transition ${
                          correct
                            ? "border-good/40 bg-emerald-50"
                            : wrong
                              ? "border-red-300 bg-red-50"
                              : selected
                                ? "border-forest bg-tint"
                                : "border-line hover:border-forest/40"
                        } ${done ? "cursor-default" : ""}`}
                      >
                        <input
                          type="radio"
                          name={question.id}
                          disabled={done}
                          checked={selected}
                          className="mt-1 accent-[#1a3585]"
                          onChange={() =>
                            setPicks((current) => {
                              const next = [...current];
                              next[index] = choiceIndex;
                              return next;
                            })
                          }
                        />
                        <span className="min-w-0 flex-1">{choice}</span>
                        {correct ? <span className="shrink-0 text-xs font-semibold text-good">Bonne réponse</span> : null}
                        {wrong ? <span className="shrink-0 text-xs font-semibold text-red-700">Votre réponse</span> : null}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          ))}
          {!done ? (
            <div className="flex flex-wrap items-center gap-3">
              <button disabled={pending} className={primaryButton}>
                {pending ? "Correction…" : "Rendre le test"}
              </button>
              <p className="text-xs text-sage">Une fois rendu, le test ne peut plus être modifié.</p>
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}
        </form>
      </div>
    </AppShell>
  );
}

function preview(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function onTab(
  event: KeyboardEvent<HTMLTextAreaElement>,
  id: string,
  sources: Record<string, string>,
  setSources: (value: Record<string, string> | ((current: Record<string, string>) => Record<string, string>)) => void,
) {
  if (event.key !== "Tab") return;
  event.preventDefault();
  const target = event.currentTarget;
  const start = target.selectionStart;
  const end = target.selectionEnd;
  const next = `${(sources[id] ?? "").slice(0, start)}  ${(sources[id] ?? "").slice(end)}`;
  setSources((current) => ({ ...current, [id]: next }));
  requestAnimationFrame(() => {
    target.selectionStart = target.selectionEnd = start + 2;
  });
}
