"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
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

export default function TestsPage() {
  const { token } = useAuth();
  const [tests, setTests] = useState<Test[]>([]);

  useEffect(() => {
    if (!token) return;
    api<Test[]>("/assessments/mine", { token }).then(setTests).catch(() => setTests([]));
  }, [token]);

  return (
    <AppShell role="CANDIDATE" title="Tests techniques & culture">
      <p className="max-w-2xl text-sm text-forest/70">
        QCM, test de code interactif (sandbox JS) et questionnaire de fit culturel — envoyés depuis le Kanban.
      </p>
      <ul className="mt-6 max-w-2xl space-y-3">
        {tests.length === 0 ? (
          <li className="text-sm text-forest/60">Aucun test assigné pour le moment.</li>
        ) : (
          tests.map((test) => (
            <li key={test.id}>
              <Link
                href={`/candidat/tests/${test.id}`}
                className="flex items-center justify-between rounded-xl border border-line bg-cream px-4 py-3"
              >
                <div>
                  <p className="font-medium">{test.title}</p>
                  <p className="text-xs text-forest/50">
                    {labelFor(test.type)} · {test.jobTitle} · {test.status}
                  </p>
                </div>
                <p className="text-copper">
                  {test.status === "COMPLETED" ? `${test.score}%` : "À passer"}
                </p>
              </Link>
            </li>
          ))
        )}
      </ul>
    </AppShell>
  );
}

function labelFor(type: string) {
  if (type === "CODE") return "Code";
  if (type === "CULTURE") return "Culture";
  if (type === "QCM") return "QCM";
  return type;
}
