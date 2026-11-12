"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Ranked = {
  job: { id: string; title: string };
  talents: {
    id: string;
    displayName: string;
    anonymous: boolean;
    headline: string | null;
    location: string | null;
    experienceYears: number;
    skills: string[];
    score: number;
    missingKeywords: string[];
  }[];
};

export default function MatchingPage() {
  const params = useParams<{ jobId: string }>();
  const { token } = useAuth();
  const [data, setData] = useState<Ranked | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!token) return;
    api<Ranked>(`/ai/job/${params.jobId}/candidates`, { token }).then(setData).catch(() => setData({ job: { id: params.jobId, title: "Profils proches" }, talents: [] }));
  }, [token, params.jobId]);

  async function add(candidateId: string) {
    if (!token) return;
    const result = await api<{ created: boolean }>("/applications/shortlist", {
      method: "POST",
      token,
      body: { jobId: params.jobId, candidateId },
    });
    setNotice(result.created ? "Profil ajouté aux candidatures." : "Ce profil est déjà dans cette offre.");
  }

  return (
    <AppShell role="RECRUITER" plain>
      <Link href={`/recruteur/pipeline/${params.jobId}`} className="text-sm font-semibold text-forest">
        Retour aux candidatures
      </Link>
      <h1 className="mt-1 text-2xl font-semibold">{data?.job.title ?? "Profils proches"}</h1>
      <p className="mt-1 max-w-xl text-sm text-sage">Personnes ouvertes aux approches, classées selon cette offre.</p>
      {notice ? <p className="mt-3 text-sm text-good">{notice}</p> : null}
      <ul className="mt-5 max-w-3xl space-y-3">
        {(data?.talents ?? []).map((talent, index) => (
          <li key={talent.id} className="rounded-2xl border border-line bg-cream p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-sage">#{index + 1}{talent.anonymous ? " · Nom masqué" : ""}</p>
                <h2 className="text-lg font-semibold">{talent.displayName}</h2>
                <p className="text-sm text-sage">
                  {talent.headline || "Sans titre"} · {talent.location || "Lieu non précisé"} · {talent.experienceYears} ans
                </p>
              </div>
              <p className="text-2xl font-semibold">{talent.score}%</p>
            </div>
            {talent.missingKeywords.length ? (
              <p className="mt-2 text-sm text-sage">À préciser : {talent.missingKeywords.join(", ")}</p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {talent.skills.map((skill) => (
                <span key={skill} className="rounded-full bg-paper px-3 py-1 text-xs">
                  {skill}
                </span>
              ))}
            </div>
            <button type="button" onClick={() => add(talent.id)} className="mt-3 rounded-lg bg-forest px-3 py-1.5 text-xs font-semibold text-cream">
              Ajouter aux candidatures
            </button>
          </li>
        ))}
      </ul>
      {data && data.talents.length === 0 ? <p className="mt-4 text-sm text-sage">Aucun profil ouvert pour le moment.</p> : null}
    </AppShell>
  );
}
