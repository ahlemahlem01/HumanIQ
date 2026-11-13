"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { SourcedNote, isSourced } from "@/components/sourced-note";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type OpenProfile = {
  id: string;
  displayName: string;
  headline: string | null;
  bio: string | null;
  location: string | null;
  experienceYears: number;
  skills: string[];
  salaryMin: number | null;
  salaryMax: number | null;
  anonymous: boolean;
  source?: string;
  linkedinUrl?: string | null;
  email?: string | null;
  experiences?: { id: string; title: string; company: string; current: boolean; description: string | null }[];
  educations?: { id: string; school: string; degree: string | null; field: string | null }[];
};

export default function RecruiterCandidatePage() {
  const { token } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [profile, setProfile] = useState<OpenProfile | null>(null);
  const [jobs, setJobs] = useState<{ id: string; title: string; status: string }[]>([]);
  const [jobId, setJobId] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token || !params.id) return;
    api<OpenProfile>(`/candidates/pool/${params.id}`, { token })
      .then(setProfile)
      .catch((err) => setError(err instanceof Error && err.message ? err.message : "Ce profil n'est plus visible."));
    api<{ id: string; title: string; status: string }[]>("/jobs/mine", { token }).then(setJobs).catch(() => setJobs([]));
  }, [token, params.id]);

  async function add() {
    if (!token || !jobId) return;
    const result = await api<{ created: boolean }>("/applications/shortlist", {
      method: "POST",
      token,
      body: { jobId, candidateId: params.id },
    });
    setNotice(result.created ? "Profil ajouté aux candidatures." : "Ce profil est déjà dans cette offre.");
  }

  return (
    <AppShell role="RECRUITER" plain>
      <button type="button" onClick={() => router.back()} className="text-sm font-semibold text-forest hover:underline">
        ← Retour
      </button>
      {error ? <p className="mt-4 text-sm text-copper">{error}</p> : null}
      {!profile && !error ? <p className="mt-4 text-sm text-forest/70">Chargement…</p> : null}
      {profile ? (
        <article className="mt-4 max-w-2xl rounded-xl border border-line bg-cream p-5">
          <p className="text-xs uppercase tracking-widest text-copper">
            {isSourced(profile.source) ? "Profil importé" : profile.anonymous ? "Anonyme" : "Identifié"}
          </p>
          <h2 className="serif mt-1 text-2xl">{profile.displayName}</h2>
          <p className="text-sm text-forest/70">
            {profile.headline || "Sans titre"} · {profile.location || "Lieu non précisé"} · {profile.experienceYears} ans
          </p>
          <p className="mt-3 text-sm">
            {profile.salaryMin
              ? `${profile.salaryMin.toLocaleString("fr-FR")}–${profile.salaryMax?.toLocaleString("fr-FR")} €`
              : "Prétentions non communiquées"}
          </p>
          {profile.email ? <p className="mt-2 text-sm">{profile.email}</p> : null}
          {profile.linkedinUrl ? (
            <a href={profile.linkedinUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-sm font-semibold text-forest hover:underline">
              Profil LinkedIn
            </a>
          ) : null}
          {profile.bio ? <p className="mt-3 text-sm leading-6">{profile.bio}</p> : null}
          {profile.experiences?.length ? (
            <div className="mt-4">
              <h3 className="text-sm font-semibold">Expérience</h3>
              <ul className="mt-1 space-y-1 text-sm">
                {profile.experiences.map((item) => (
                  <li key={item.id}>
                    {item.title} · {item.company}
                    {item.current ? " (actuel)" : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {profile.educations?.length ? (
            <div className="mt-4">
              <h3 className="text-sm font-semibold">Formation</h3>
              <ul className="mt-1 space-y-1 text-sm">
                {profile.educations.map((item) => (
                  <li key={item.id}>{[item.degree, item.field, item.school].filter(Boolean).join(" · ")}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {isSourced(profile.source) ? <SourcedNote className="mt-4" /> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {profile.skills.map((skill) => (
              <span key={skill} className="rounded-full bg-paper px-3 py-1 text-xs">
                {skill}
              </span>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <select value={jobId} onChange={(event) => setJobId(event.target.value)} className="rounded-full border border-line bg-paper px-3 py-1.5 text-sm">
              <option value="">Ajouter à une offre</option>
              {jobs
                .filter((job) => job.status === "PUBLISHED")
                .map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.title}
                  </option>
                ))}
            </select>
            <button type="button" onClick={() => void add()} className="rounded-lg bg-forest px-3 py-1.5 text-xs font-semibold text-cream">
              Ajouter
            </button>
          </div>
          {notice ? <p className="mt-2 text-sm text-good">{notice}</p> : null}
        </article>
      ) : null}
    </AppShell>
  );
}
