"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
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

export default function AtsPage() {
  const { token } = useAuth();
  const fileInput = useRef<HTMLInputElement>(null);
  const [audit, setAudit] = useState<Audit | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setAudit(await api<Audit>("/ai/cv/ats", { token }));
  }, [token]);

  useEffect(() => {
    load().catch(() => setError("Analyse indisponible."));
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
  const tone = score >= 75 ? "text-[#145c40]" : score >= 50 ? "text-warn" : "text-forest";

  return (
    <AppShell role="CANDIDATE" plain>
      <div className="mx-auto max-w-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold">Analyse ATS</h1>
            <p className="mt-1 text-sm text-sage">
              Ce qu&apos;un logiciel de recrutement arrive à lire dans votre CV : titre, dates, compétences, coordonnées.
            </p>
          </div>
          <Link href="/candidat/cv-builder" className="shrink-0 rounded-lg bg-forest px-3 py-1.5 text-xs font-semibold text-cream">
            Corriger le CV
          </Link>
        </div>

        <section className="mt-5 rounded-xl border border-line bg-cream px-5 py-5">
          <p className="text-xs text-sage">{audit?.fileName ?? "Aucun fichier"}</p>
          <p className={`mt-1 text-3xl font-semibold ${tone}`}>{audit ? `${score}%` : "—"}</p>
          <p className="mt-1 text-sm text-sage">{audit ? verdict(score) : "Chargement…"}</p>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-paper">
            <div className="h-full rounded-full bg-forest" style={{ width: `${score}%` }} />
          </div>
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
            disabled={pending}
            onClick={() => fileInput.current?.click()}
            className="mt-4 rounded-lg border border-forest px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
          >
            {pending ? "Lecture…" : audit && score > 0 ? "Analyser un autre CV" : "Déposer un CV"}
          </button>
        </section>

        {error ? <p className="mt-3 text-sm text-warn">{error}</p> : null}

        <ul className="mt-4 divide-y divide-line rounded-xl border border-line bg-cream">
          {(audit?.checks ?? []).map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-4 px-4 py-3">
              <div>
                <p className="text-sm font-medium">{item.label}</p>
                <p className="mt-0.5 text-sm text-sage">{item.detail}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${pill(item.status)}`}>
                {item.status === "ok" ? "Lu" : item.status === "warn" ? "À préciser" : "Manquant"}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </AppShell>
  );
}

function verdict(score: number) {
  if (score >= 75) return "Un logiciel de recrutement peut lire l'essentiel.";
  if (score >= 50) return "La structure passe, quelques éléments restent flous.";
  if (score > 0) return "Le CV risque d'être mal lu. Reprenez les points manquants.";
  return "Déposez un CV pour obtenir le score.";
}

function pill(status: Check["status"]) {
  if (status === "ok") return "bg-[#e7f6ee] text-[#145c40]";
  if (status === "warn") return "bg-[#fff4e5] text-warn";
  return "bg-paper text-forest";
}
