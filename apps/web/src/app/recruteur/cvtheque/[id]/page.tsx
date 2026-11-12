"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Cv = {
  id: string;
  name: string;
  email: string;
  headline: string | null;
  bio: string | null;
  location: string | null;
  experienceYears: number;
  skills: string[];
  fileName: string | null;
  cvText: string | null;
  experiences: { id: string; title: string; company: string; location: string | null; current: boolean; description: string | null }[];
  educations: { id: string; school: string; degree: string | null; field: string | null }[];
};

export default function CvLibraryDetailPage() {
  const params = useParams<{ id: string }>();
  const { token } = useAuth();
  const [cv, setCv] = useState<Cv | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!token) return;
    api<Cv>(`/candidates/cvtheque/${params.id}`, { token })
      .then(setCv)
      .catch(() => setMissing(true));
  }, [token, params.id]);

  return (
    <AppShell role="RECRUITER" plain>
      <div className="mx-auto max-w-[1100px]">
        <Link href="/recruteur/cvtheque" className="text-sm font-semibold text-forest hover:underline">
          ← Retour à la CVthèque
        </Link>
        {missing ? <p className="mt-4 text-sm text-sage">Ce CV est introuvable.</p> : null}
        {!cv && !missing ? <p className="mt-4 text-sm text-sage">Chargement…</p> : null}
        {cv ? (
          <div className="mt-4 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0 space-y-3">
              <section className="overflow-hidden rounded-2xl border border-line bg-cream">
                <div className="h-32 bg-forest" />
                <div className="px-6 pb-6">
                  <span className="-mt-14 flex h-28 w-28 items-center justify-center rounded-full border-4 border-white bg-forest text-3xl font-semibold text-white">
                    {initials(cv.name)}
                  </span>
                  <h1 className="mt-3 text-2xl font-semibold leading-tight">{cv.name}</h1>
                  <p className="mt-1 text-base">{cv.headline || "Sans titre"}</p>
                  <p className="mt-1 text-sm text-sage">
                    {cv.location || "Lieu non précisé"} · {cv.experienceYears} an{cv.experienceYears > 1 ? "s" : ""} d&apos;expérience
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link
                      href={`/recruteur/messages?candidate=${cv.id}`}
                      className="rounded-full bg-forest px-5 py-2 text-sm font-semibold text-white"
                    >
                      Contacter
                    </Link>
                    <Link
                      href="/recruteur/sourcing"
                      className="rounded-full border border-forest px-5 py-2 text-sm font-semibold text-forest hover:bg-tint"
                    >
                      Ouvrir le vivier
                    </Link>
                  </div>
                </div>
              </section>

              {cv.bio ? (
                <section className="rounded-2xl border border-line bg-cream px-6 py-5">
                  <h2 className="mb-2 text-xl font-semibold">À propos</h2>
                  <p className="whitespace-pre-wrap text-sm leading-6">{cv.bio}</p>
                </section>
              ) : null}

              {cv.experiences.length > 0 ? (
                <section className="rounded-2xl border border-line bg-cream px-6 py-5">
                  <h2 className="mb-2 text-xl font-semibold">Expérience</h2>
                  <ul className="divide-y divide-line">
                    {cv.experiences.map((item) => (
                      <li key={item.id} className="flex gap-3 py-4 first:pt-2 last:pb-0">
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-line bg-paper text-sm font-semibold">
                          {initials(item.company)}
                        </span>
                        <div className="min-w-0">
                          <p className="font-semibold">{item.title}</p>
                          <p className="text-sm">
                            {item.company}
                            {item.current ? " · En poste" : ""}
                          </p>
                          {item.location ? <p className="text-sm text-sage">{item.location}</p> : null}
                          {item.description ? <p className="mt-2 text-sm leading-6">{item.description}</p> : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {cv.educations.length > 0 ? (
                <section className="rounded-2xl border border-line bg-cream px-6 py-5">
                  <h2 className="mb-2 text-xl font-semibold">Formation</h2>
                  <ul className="divide-y divide-line">
                    {cv.educations.map((item) => (
                      <li key={item.id} className="flex gap-3 py-4 first:pt-2 last:pb-0">
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-line bg-paper text-sm font-semibold">
                          {initials(item.school)}
                        </span>
                        <div>
                          <p className="font-semibold">{item.school}</p>
                          <p className="text-sm">{[item.degree, item.field].filter(Boolean).join(", ") || "Formation"}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section className="rounded-2xl border border-line bg-cream px-6 py-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-xl font-semibold">CV déposé</h2>
                  {cv.fileName ? (
                    <span className="rounded-md bg-paper px-3 py-1 text-xs font-medium text-sage">{cv.fileName}</span>
                  ) : null}
                </div>
                {cv.cvText ? (
                  <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap rounded-xl border border-line bg-white p-5 font-sans text-sm leading-6">
                    {cv.cvText}
                  </pre>
                ) : (
                  <p className="text-sm text-sage">Aucun fichier de CV déposé. Voici le profil du candidat.</p>
                )}
              </section>
            </div>

            <aside className="space-y-3 lg:sticky lg:top-20">
              <section className="rounded-2xl border border-line bg-cream p-5">
                <h2 className="text-base font-semibold">Coordonnées</h2>
                <dl className="mt-3 space-y-3 text-sm">
                  <div>
                    <dt className="text-xs text-sage">E-mail</dt>
                    <dd className="mt-0.5 break-all">{cv.email}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-sage">Lieu</dt>
                    <dd className="mt-0.5">{cv.location || "Non précisé"}</dd>
                  </div>
                </dl>
              </section>
              <section className="rounded-2xl border border-line bg-cream p-5">
                <h2 className="text-base font-semibold">Compétences</h2>
                {cv.skills.length === 0 ? (
                  <p className="mt-3 text-sm text-sage">Aucune compétence renseignée.</p>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {cv.skills.map((skill) => (
                      <span key={skill} className="rounded-full border border-line bg-white px-3 py-1 text-sm font-medium">
                        {skill}
                      </span>
                    ))}
                  </div>
                )}
              </section>
            </aside>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
