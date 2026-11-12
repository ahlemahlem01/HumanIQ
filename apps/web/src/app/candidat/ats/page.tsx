"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card, ghostButton, PageHeader, Pill, primaryButton, ScoreRing, Skeleton } from "@/components/candidate-ui";
import { api, upload } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Check = {
  id: string;
  label: string;
  status: "ok" | "warn" | "missing";
  detail: string;
};

type Audit = {
  fileName: string | null;
  score: number;
  checks: Check[];
};

/** Which step of the CV Studio fixes each check. Format and file checks are fixed by uploading another file. */
const FIX_STEP: Record<string, string> = {
  email: "identite",
  phone: "identite",
  location: "identite",
  headline: "identite",
  experience: "experience",
  dates: "experience",
  bullets: "experience",
  education: "formation",
  skills: "competences",
  length: "export",
};

export default function AtsPage() {
  const { token } = useAuth();
  const fileInput = useRef<HTMLInputElement>(null);
  const [audit, setAudit] = useState<Audit | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [dragging, setDragging] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setAudit(await api<Audit>("/ai/cv/ats", { token }));
  }, [token]);

  useEffect(() => {
    load().catch(() => setError("Analyse indisponible."));
  }, [load]);

  // Coming back from the CV Studio: refresh so the score reflects what was just fixed.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") load().catch(() => undefined);
    };
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, [load]);

  async function takeFile(file?: File) {
    if (!file || !token) return;
    setPending(true);
    setError("");
    try {
      await upload("/ai/cv/upload", file, { token });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lecture impossible.");
    } finally {
      setPending(false);
    }
  }

  const score = audit?.score ?? 0;
  const hasFile = Boolean(audit && audit.fileName);
  const checks = audit?.checks ?? [];
  const todo = checks.filter((item) => item.status !== "ok").sort((a, b) => Number(b.status === "missing") - Number(a.status === "missing"));
  const done = checks.filter((item) => item.status === "ok");

  return (
    <AppShell role="CANDIDATE" plain>
      <div className="mx-auto max-w-3xl">
        <PageHeader
          title="Analyse ATS"
          intro="Ce qu'un logiciel de recrutement arrive à lire dans votre CV : titre, dates, compétences, coordonnées."
          action={
            <Link href="/candidat/cv-builder" className={primaryButton}>
              Ouvrir le créateur de CV
            </Link>
          }
        />

        <input
          ref={fileInput}
          type="file"
          accept=".pdf,.docx,.txt,.md"
          className="hidden"
          onChange={(event) => {
            void takeFile(event.currentTarget.files?.[0]);
            event.currentTarget.value = "";
          }}
        />

        <Card
          className={`transition ${dragging ? "border-forest bg-tint" : ""}`}
        >
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              void takeFile(event.dataTransfer.files?.[0]);
            }}
            className="flex flex-wrap items-center gap-5"
          >
            {audit === null && !error ? (
              <Skeleton className="h-[88px] w-[88px] rounded-full" />
            ) : (
              <ScoreRing value={score} label={`Score ATS ${score} sur 100`} />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-sage">{hasFile ? audit?.fileName : "Aucun fichier analysé"}</p>
              <p className="mt-0.5 text-lg font-semibold">{audit ? verdictTitle(score, hasFile) : "Analyse en cours…"}</p>
              <p className="mt-0.5 text-sm leading-6 text-sage">{audit ? verdict(score, hasFile) : ""}</p>
            </div>
            <button type="button" disabled={pending} onClick={() => fileInput.current?.click()} className={ghostButton}>
              {pending ? "Lecture…" : hasFile ? "Analyser un autre CV" : "Déposer un CV"}
            </button>
          </div>
          <p className="mt-3 text-xs text-sage">Glissez un fichier ici : PDF, Word ou texte.</p>
        </Card>

        {error ? (
          <p role="alert" className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-warn">
            {error}
          </p>
        ) : null}

        {audit === null && !error ? (
          <div className="mt-4 space-y-3">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : null}

        {todo.length > 0 ? (
          <Card className="mt-4">
            <h2 className="font-semibold">À corriger en priorité</h2>
            <ul className="mt-3 divide-y divide-line">
              {todo.map((item) => {
                const step = FIX_STEP[item.id];
                return (
                  <li key={item.id} className="flex items-center gap-3 py-3">
                    <Pill tone={item.status === "missing" ? "bad" : "warn"} className="w-20 shrink-0 justify-center">
                      {item.status === "missing" ? "Manquant" : "À préciser"}
                    </Pill>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="mt-0.5 text-sm leading-5 text-sage">{item.detail}</p>
                    </div>
                    {step ? (
                      <Link href={`/candidat/cv-builder?step=${step}`} className="shrink-0 rounded-full border border-forest px-3 py-1 text-xs font-semibold text-forest hover:bg-tint active:scale-95">
                        Corriger
                      </Link>
                    ) : (
                      <button type="button" onClick={() => fileInput.current?.click()} className="shrink-0 rounded-full border border-forest px-3 py-1 text-xs font-semibold text-forest hover:bg-tint active:scale-95">
                        Déposer
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        ) : null}

        {done.length > 0 ? (
          <details className="group mt-4 rounded-2xl border border-line bg-white" open={todo.length === 0}>
            <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 font-semibold">
              Bien lu par les logiciels ({done.length})
              <span className="text-sage transition group-open:rotate-180" aria-hidden>
                ⌄
              </span>
            </summary>
            <ul className="divide-y divide-line border-t border-line px-5">
              {done.map((item) => (
                <li key={item.id} className="flex items-start gap-3 py-3">
                  <Pill tone="good" className="w-20 shrink-0 justify-center">
                    Lu
                  </Pill>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="mt-0.5 text-sm leading-5 text-sage">{item.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </AppShell>
  );
}

function verdictTitle(score: number, hasFile: boolean) {
  if (!hasFile) return "Déposez votre CV";
  if (score >= 75) return "Très bien lu";
  if (score >= 50) return "Lisible, à améliorer";
  return "Risque d'être mal lu";
}

function verdict(score: number, hasFile: boolean) {
  if (!hasFile) return "Nous lirons votre CV comme un logiciel de recrutement et listerons ce qu'il faut corriger.";
  if (score >= 75) return "Un logiciel de recrutement peut lire l'essentiel.";
  if (score >= 50) return "La structure passe, quelques éléments restent flous.";
  return "Reprenez les points ci-dessous, ou refaites votre CV dans le créateur.";
}
