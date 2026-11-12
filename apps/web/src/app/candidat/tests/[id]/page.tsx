"use client";

import { useParams } from "next/navigation";
import { FormEvent, KeyboardEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
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

  if (!test) return <AppShell role="CANDIDATE" title="Test">Chargement…</AppShell>;
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
    <AppShell role="CANDIDATE" title={test.title}>
      <p className="text-sm text-forest/60">{test.jobTitle} · JavaScript · sandbox Node vm (timeout 400 ms / test)</p>
      {done ? <p className="serif mt-4 text-5xl text-copper">{test.score}%</p> : null}
      <div className="mt-6 space-y-6">
        {(test.challenges ?? []).map((challenge) => {
          const runResult = runs[challenge.id];
          const submitted = test.reports?.find((item) => item.challengeId === challenge.id);
          const results = submitted?.results ?? runResult?.results;
          return (
            <section key={challenge.id} className="rounded-2xl border border-line bg-cream p-5">
              <p className="text-xs uppercase tracking-widest text-copper">{challenge.competency}</p>
              <h2 className="serif mt-1 text-2xl">{challenge.title}</h2>
              <p className="mt-2 text-sm text-forest/80">{challenge.prompt}</p>
              <p className="mt-3 text-xs text-forest/50">
                Tests publics :{" "}
                {challenge.publicTests
                  .map((item) => `${challenge.functionName}(${item.args.map(preview).join(", ")}) → ${preview(item.expected)}`)
                  .join(" · ")}
              </p>
              <textarea
                value={sources[challenge.id] ?? ""}
                disabled={done}
                spellCheck={false}
                onKeyDown={(event) => onTab(event, challenge.id, sources, setSources)}
                onChange={(event) =>
                  setSources((current) => ({ ...current, [challenge.id]: event.target.value }))
                }
                rows={12}
                className="mt-4 w-full rounded-2xl border border-line bg-paper p-3 font-mono text-sm"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                {!done ? (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => run(challenge.id)}
                    className="rounded-full border border-line px-4 py-2 text-sm disabled:opacity-60"
                  >
                    {busy === challenge.id ? "Exécution…" : "Lancer les tests publics"}
                  </button>
                ) : null}
                {runResult ? (
                  <p className="self-center text-sm">
                    Publics {runResult.passed}/{runResult.total}
                  </p>
                ) : null}
                {submitted ? (
                  <p className="self-center text-sm text-copper">
                    Tous tests {submitted.passed}/{submitted.total}
                  </p>
                ) : null}
              </div>
              {results?.length ? (
                <ul className="mt-3 space-y-1 text-sm">
                  {results.map((item) => (
                    <li key={item.id} className={item.ok ? "text-good" : "text-copper"}>
                      {item.ok ? "OK" : "KO"} · {item.public ? "public" : "caché"} {item.id}
                      {item.error ? ` — ${item.error}` : ""}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          );
        })}
        {!done ? (
          <button
            type="button"
            disabled={busy !== null}
            onClick={submit}
            className="rounded-full bg-forest px-5 py-2 text-cream disabled:opacity-60"
          >
            {busy === "submit" ? "Correction…" : "Rendre le test (tests cachés inclus)"}
          </button>
        ) : null}
        {error ? <p className="text-sm text-copper">{error}</p> : null}
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
    <AppShell role="CANDIDATE" title={test.title}>
      <p className="text-sm text-forest/60">{test.jobTitle}</p>
      {done ? <p className="serif mt-4 text-5xl text-copper">{test.score}%</p> : null}
      <form onSubmit={onSubmit} className="mt-6 max-w-2xl space-y-6">
        {test.questions.map((question, index) => (
          <fieldset key={question.id} className="rounded-2xl border border-line bg-cream p-5">
            <legend className="text-xs uppercase tracking-widest text-copper">{question.competency}</legend>
            <p className="mt-2 font-medium">{question.prompt}</p>
            <ul className="mt-3 space-y-2">
              {question.choices.map((choice, choiceIndex) => {
                const selected = picks[index] === choiceIndex;
                const correct = done && question.correctIndex === choiceIndex;
                return (
                  <li key={choice}>
                    <label
                      className={`flex cursor-pointer gap-2 rounded-xl px-3 py-2 text-sm ${
                        correct ? "bg-good/15" : selected ? "bg-paper" : ""
                      }`}
                    >
                      <input
                        type="radio"
                        name={question.id}
                        disabled={done}
                        checked={selected}
                        onChange={() =>
                          setPicks((current) => {
                            const next = [...current];
                            next[index] = choiceIndex;
                            return next;
                          })
                        }
                      />
                      {choice}
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        ))}
        {!done ? (
          <button disabled={pending} className="rounded-full bg-forest px-5 py-2 text-cream disabled:opacity-60">
            {pending ? "Correction…" : "Rendre le test"}
          </button>
        ) : null}
        {error ? <p className="text-sm text-copper">{error}</p> : null}
      </form>
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
