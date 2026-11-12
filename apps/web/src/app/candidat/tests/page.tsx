"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { EmptyState, PageHeader, Pill, scoreTone, Skeleton } from "@/components/candidate-ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Test = {
  id: string;
  type: string;
  title: string;
  status: string;
  score: number | null;
  jobTitle?: string;
};

const TYPE_LABEL: Record<string, string> = { QCM: "QCM", CODE: "Code", CULTURE: "Culture", INTERVIEW: "Entretien" };

export default function TestsPage() {
  const { token } = useAuth();
  const [tests, setTests] = useState<Test[] | null>(null);

  useEffect(() => {
    if (!token) return;
    api<Test[]>("/assessments/mine", { token }).then(setTests).catch(() => setTests([]));
  }, [token]);

  const todo = (tests ?? []).filter((test) => test.status !== "COMPLETED");
  const done = (tests ?? []).filter((test) => test.status === "COMPLETED");

  return (
    <AppShell role="CANDIDATE" plain>
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Tests techniques & culture" intro="QCM, exercices de code et questionnaires de fit culturel envoyés par les recruteurs depuis leur pipeline." />

        {tests === null ? (
          <div className="space-y-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        ) : null}

        {tests && tests.length === 0 ? (
          <EmptyState
            title="Aucun test assigné"
            text="Quand un recruteur vous enverra un test, il apparaîtra ici. En attendant, vous pouvez vous entraîner aux entretiens."
            href="/candidat/entretien"
            cta="M'entraîner à l'entretien"
          />
        ) : null}

        {todo.length > 0 ? <Group title="À passer" tests={todo} /> : null}
        {done.length > 0 ? <Group title="Terminés" tests={done} /> : null}
      </div>
    </AppShell>
  );
}

function Group({ title, tests }: { title: string; tests: Test[] }) {
  return (
    <section className="mb-6" aria-label={title}>
      <h2 className="mb-2 text-lg font-semibold">
        {title} <span className="text-sm font-normal text-sage">({tests.length})</span>
      </h2>
      <ul className="space-y-3">
        {tests.map((test) => {
          const completed = test.status === "COMPLETED";
          return (
            <li key={test.id}>
              <Link
                href={`/candidat/tests/${test.id}`}
                className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-white px-4 py-3.5 transition hover:-translate-y-0.5 hover:border-forest/40 hover:shadow-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold">{test.title}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-sage">
                    <Pill tone="neutral">{TYPE_LABEL[test.type] ?? test.type}</Pill>
                    {test.jobTitle ? <span className="truncate">{test.jobTitle}</span> : null}
                  </p>
                </div>
                {completed && test.score != null ? (
                  <Pill tone={scoreTone(test.score)} className="shrink-0">
                    {test.score} %
                  </Pill>
                ) : (
                  <span className="shrink-0 rounded-full bg-forest px-3.5 py-1 text-xs font-semibold text-white">Commencer</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
