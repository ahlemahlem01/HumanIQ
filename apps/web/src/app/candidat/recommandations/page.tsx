"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Recommendation = {
  semanticScore: number;
  similarity: number;
  job: {
    id: string;
    title: string;
    location: string;
    remote: boolean;
    requiredSkills: string[];
    salaryMin: number | null;
    salaryMax: number | null;
    currency: string;
    company: string;
  };
};

export default function RecommendationsPage() {
  const { token } = useAuth();
  const [items, setItems] = useState<Recommendation[] | null>(null);

  useEffect(() => {
    if (!token) return;
    api<Recommendation[]>("/ai/recommendations", { token })
      .then(setItems)
      .catch(() => setItems([]));
  }, [token]);

  return (
    <AppShell role="CANDIDATE" title="Offres recommandées">
      <p className="max-w-2xl text-sm text-forest/70">
        Classement par similarité cosinus entre le vecteur de votre profil et celui de chaque offre,
        calculé directement en base avec pgvector.
      </p>

      {items === null ? (
        <p className="mt-6 text-sm text-forest/60">Calcul des similarités…</p>
      ) : items.length === 0 ? (
        <p className="mt-6 max-w-2xl text-sm text-forest/70">
          Aucune recommandation pour l'instant.{" "}
          <Link href="/candidat/cv" className="text-copper">
            Téléversez votre CV
          </Link>{" "}
          pour générer votre vecteur de profil.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {items.map((item) => (
            <li key={item.job.id}>
              <Link
                href={`/offres/${item.job.id}`}
                className="flex items-start justify-between gap-4 rounded-2xl border border-line bg-cream p-5 hover:border-forest/30"
              >
                <div>
                  <p className="text-xs uppercase tracking-widest text-copper">
                    {item.job.company}
                  </p>
                  <h2 className="serif mt-1 text-xl">{item.job.title}</h2>
                  <p className="mt-1 text-sm text-forest/70">
                    {item.job.location}
                    {item.job.remote ? " · Remote" : ""}
                    {item.job.salaryMin
                      ? ` · ${item.job.currency === "TND" ? `${Math.round(item.job.salaryMin / 12).toLocaleString("fr-FR")}–${Math.round((item.job.salaryMax ?? item.job.salaryMin) / 12).toLocaleString("fr-FR")} DT / mois` : `${item.job.salaryMin.toLocaleString("fr-FR")}–${item.job.salaryMax?.toLocaleString("fr-FR")} € / an`}`
                      : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {item.job.requiredSkills.map((skill) => (
                      <span key={skill} className="rounded-full bg-paper px-3 py-1 text-xs">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="serif text-3xl text-copper">{item.semanticScore}%</p>
                  <p className="text-xs text-forest/50">cos {item.similarity.toFixed(3)}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
