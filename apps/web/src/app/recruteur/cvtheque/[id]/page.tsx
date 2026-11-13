"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { api, apiBlob } from "@/lib/api";
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
  hasFile: boolean;
  cvText: string | null;
  experiences: { id: string; title: string; company: string; location: string | null; current: boolean; description: string | null }[];
  educations: { id: string; school: string; degree: string | null; field: string | null }[];
};

export default function CvLibraryDetailPage() {
  const params = useParams<{ id: string }>();
  const { token } = useAuth();
  const [cv, setCv] = useState<Cv | null>(null);
  const [missing, setMissing] = useState(false);
  const [fileError, setFileError] = useState("");
  const btnLine = "rounded-full border border-forest px-4 py-1.5 text-sm font-semibold text-forest hover:bg-tint";
  const btnSolid = "rounded-full bg-forest px-4 py-1.5 text-sm font-semibold text-white hover:bg-forest-dark";

  async function openFile(download: boolean) {
    if (!cv) return;
    setFileError("");
    // Open the tab first (the click is the user gesture), then point it at the file once it is loaded.
    const tab = download ? null : window.open("", "_blank");
    try {
      const blob = await apiBlob(`/candidates/cvtheque/${cv.id}/file`, token);
      const url = URL.createObjectURL(blob);
      if (download) {
        const link = document.createElement("a");
        link.href = url;
        link.download = cv.fileName ?? "cv";
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else if (tab) {
        tab.location.href = url;
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    } catch (err) {
      tab?.close();
      setFileError(err instanceof Error ? err.message : "Fichier indisponible.");
    }
  }

  function downloadText() {
    if (!cv?.cvText) return;
    const base = (cv.fileName ?? cv.name).replace(/\.[a-z0-9]{1,8}$/i, "").replace(/[^\w.-]+/g, "-") || "cv";
    const url = URL.createObjectURL(new Blob([cv.cvText], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${base}.txt`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /** A clean one-page sheet built from the stored profile, opened for printing / saving as PDF. */
  function printSheet() {
    if (!cv) return;
    const esc = (value: string) => value.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
    const list = (items: string[]) => (items.length ? `<ul>${items.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>` : "");
    const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(cv.name)} - fiche profil</title>
<style>
body{font:14px/1.5 system-ui,sans-serif;color:#0b1f4b;max-width:720px;margin:32px auto;padding:0 24px}
h1{margin:0;font-size:26px}h2{margin:24px 0 6px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#1a3585;border-bottom:1px solid #d5deea;padding-bottom:4px}
.muted{color:#5c6d8a}ul{margin:4px 0;padding-left:18px}pre{white-space:pre-wrap;font:inherit}
.tag{display:inline-block;border:1px solid #d5deea;border-radius:999px;padding:1px 10px;margin:0 6px 6px 0;font-size:12px}
@media print{body{margin:0}}
</style></head><body>
<h1>${esc(cv.name)}</h1>
<p class="muted">${esc([cv.headline, cv.location, `${cv.experienceYears} an${cv.experienceYears > 1 ? "s" : ""} d'expérience`].filter(Boolean).join(" · "))}</p>
${cv.bio ? `<h2>À propos</h2><p>${esc(cv.bio)}</p>` : ""}
${cv.skills.length ? `<h2>Compétences</h2><p>${cv.skills.map((skill) => `<span class="tag">${esc(skill)}</span>`).join("")}</p>` : ""}
${cv.experiences.length ? `<h2>Expérience</h2>${list(cv.experiences.map((e) => `${e.title} - ${e.company}${e.description ? ` : ${e.description}` : ""}`))}` : ""}
${cv.educations.length ? `<h2>Formation</h2>${list(cv.educations.map((e) => [e.degree, e.field, e.school].filter(Boolean).join(" - ")))}` : ""}
${cv.cvText ? `<h2>Texte du profil</h2><pre>${esc(cv.cvText)}</pre>` : ""}
<script>window.onload=function(){setTimeout(function(){window.print()},250)}</script>
</body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

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
                  {cv.fileName && cv.hasFile ? (
                    <span className="rounded-md bg-paper px-3 py-1 text-xs font-medium text-sage">{cv.fileName}</span>
                  ) : null}
                </div>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  {cv.hasFile ? (
                    <>
                      <button type="button" onClick={() => void openFile(false)} className={btnLine}>
                        Ouvrir le CV
                      </button>
                      <button type="button" onClick={() => void openFile(true)} className={btnSolid}>
                        Télécharger le CV
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" onClick={printSheet} className={btnSolid}>
                        Fiche profil (PDF)
                      </button>
                      {cv.cvText ? (
                        <button type="button" onClick={downloadText} className={btnLine}>
                          Texte (.txt)
                        </button>
                      ) : null}
                    </>
                  )}
                  {fileError ? <span className="text-sm text-red-700">{fileError}</span> : null}
                </div>
                {!cv.hasFile ? (
                  <p className="mb-3 text-xs leading-5 text-sage">
                    Le fichier d&apos;origine n&apos;est pas disponible (profil importé ou CV déposé avant l&apos;archivage). La fiche profil
                    est générée à partir des informations enregistrées ; dans la fenêtre d&apos;impression, choisissez « Enregistrer au format PDF ».
                  </p>
                ) : null}
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
