"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { EmptyState, PageHeader, Pill, ScoreRing, Skeleton } from "@/components/candidate-ui";
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
  const [skills, setSkills] = useState<string[]>([]);

  useEffect(() => {
    if (!token) return;
    api<Recommendation[]>("/ai/recommendations", { token })
      .then(setItems)
      .catch(() => setItems([]));
    api<{ skills?: string[] }>("/candidates/me", { token })
      .then((profile) => setSkills((profile.skills ?? []).map((skill) => skill.toLowerCase())))
      .catch(() => undefined);
  }, [token]);

  return (
    <AppShell role="CANDIDATE" plain>
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Offres recommandées" intro="Classées selon la proximité entre votre profil et chaque offre. Les compétences que vous avez déjà sont marquées en vert." />

        {items === null ? (
          <div className="space-y-3">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
        ) : null}

        {items && items.length === 0 ? (
          <EmptyState title="Aucune recommandation pour l'instant" text="Complétez votre profil ou déposez votre CV : nous en déduisons les offres qui vous correspondent." href="/candidat/cv-builder" cta="Créer mon CV" />
        ) : null}

        {items && items.length > 0 ? (
          <ul className="space-y-3">
            {items.map((item) => {
              const matched = item.job.requiredSkills.filter((skill) => skills.includes(skill.toLowerCase()));
              return (
                <li key={item.job.id}>
                  <Link href={`/offres/${item.job.id}`} className="flex items-start gap-4 rounded-2xl border border-line bg-white p-4 transition hover:-translate-y-0.5 hover:border-forest/40 hover:shadow-sm sm:p-5">
                    <ScoreRing value={item.semanticScore} size={64} label={`Correspondance ${item.semanticScore} %`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-sage">{item.job.company}</p>
                      <h2 className="mt-0.5 text-lg font-semibold leading-snug">{item.job.title}</h2>
                      <p className="mt-1 text-sm text-sage">
                        {item.job.location}
                        {item.job.remote ? " · Remote" : ""}
                        {salary(item.job) ? ` · ${salary(item.job)}` : ""}
                      </p>
                      {item.job.requiredSkills.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {item.job.requiredSkills.map((skill) => (
                            <Pill key={skill} tone={skills.includes(skill.toLowerCase()) ? "good" : "neutral"}>
                              {skills.includes(skill.toLowerCase()) ? "✓ " : ""}
                              {skill}
                            </Pill>
                          ))}
                        </div>
                      ) : null}
                      {item.job.requiredSkills.length > 0 && skills.length > 0 ? (
                        <p className="mt-2 text-xs text-sage">
                          Vous avez {matched.length} compétence{matched.length > 1 ? "s" : ""} sur {item.job.requiredSkills.length}.
                        </p>
                      ) : null}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </AppShell>
  );
}

function salary(job: Recommendation["job"]) {
  if (!job.salaryMin) return "";
  const max = job.salaryMax ?? job.salaryMin;
  if (job.currency === "TND") {
    return `${Math.round(job.salaryMin / 12).toLocaleString("fr-FR")}–${Math.round(max / 12).toLocaleString("fr-FR")} DT / mois`;
  }
  return `${job.salaryMin.toLocaleString("fr-FR")}–${max.toLocaleString("fr-FR")} € / an`;
}
