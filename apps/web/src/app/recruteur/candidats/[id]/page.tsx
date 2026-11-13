"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { isSourced, SourcedNote } from "@/components/sourced-note";
import { api, apiBlob, STAGE_LABEL } from "@/lib/api";
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
  currency?: string;
  anonymous: boolean;
  source?: string;
  own?: boolean;
  linkedinUrl?: string | null;
  email?: string | null;
  applications?: { id: string; stage: string; job: { id: string; title: string } }[];
  cv?: { hasFile: boolean; fileName: string | null; text: string | null } | null;
  experiences?: { id: string; title: string; company: string; current: boolean; description: string | null }[];
  educations?: { id: string; school: string; degree: string | null; field: string | null }[];
};

type Note = { id: string; body: string; createdAt: string; author: { id: string; name: string } };
type JobLite = { id: string; title: string; status: string };

const card = "rounded-2xl border border-line bg-white p-6";
const btnLine = "rounded-full border border-forest px-4 py-1.5 text-sm font-semibold text-forest hover:bg-tint";
const btnSolid = "rounded-full bg-forest px-4 py-1.5 text-sm font-semibold text-white hover:bg-forest-dark disabled:opacity-60";

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export default function RecruiterCandidatePage() {
  const { token } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [profile, setProfile] = useState<OpenProfile | null>(null);
  const [jobs, setJobs] = useState<JobLite[]>([]);
  const [jobId, setJobId] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [appId, setAppId] = useState("");
  const [notes, setNotes] = useState<Note[]>([]);
  const [draft, setDraft] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteError, setNoteError] = useState("");
  const [fileError, setFileError] = useState("");
  const [showText, setShowText] = useState(false);

  async function load() {
    if (!token || !params.id) return;
    try {
      const loaded = await api<OpenProfile>(`/candidates/pool/${params.id}`, { token });
      setProfile(loaded);
      setAppId((current) => current || loaded.applications?.[0]?.id || "");
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Ce profil n'est plus visible.");
    }
  }

  useEffect(() => {
    void load();
    if (token) api<JobLite[]>("/jobs/mine", { token }).then(setJobs).catch(() => setJobs([]));
  }, [token, params.id]);

  useEffect(() => {
    if (!token || !appId) {
      setNotes([]);
      return;
    }
    api<Note[]>(`/applications/${appId}/notes`, { token })
      .then(setNotes)
      .catch(() => setNotes([]));
  }, [token, appId]);

  async function addToJob() {
    if (!token || !jobId) return;
    const result = await api<{ created: boolean }>("/applications/shortlist", { method: "POST", token, body: { jobId, candidateId: params.id } });
    setNotice(result.created ? "Profil ajouté aux candidatures de cette offre." : "Ce profil est déjà dans cette offre.");
    setJobId("");
    await load();
  }

  async function addNote() {
    const body = draft.trim();
    if (!token || !appId || !body) return;
    setNoteBusy(true);
    setNoteError("");
    try {
      const created = await api<Note>(`/applications/${appId}/notes`, { method: "POST", token, body: { body } });
      setNotes((current) => [...current, created]);
      setDraft("");
    } catch (err) {
      setNoteError(err instanceof Error ? err.message : "Note non enregistrée.");
    } finally {
      setNoteBusy(false);
    }
  }

  async function openFile(download: boolean) {
    if (!profile) return;
    setFileError("");
    const tab = download ? null : window.open("", "_blank");
    try {
      const blob = await apiBlob(`/candidates/pool/${profile.id}/cv-file`, token);
      const url = URL.createObjectURL(blob);
      if (download) {
        const link = document.createElement("a");
        link.href = url;
        link.download = profile.cv?.fileName ?? "cv";
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

  const imported = isSourced(profile?.source);
  const inJobs = new Set((profile?.applications ?? []).map((item) => item.job.id));
  const addable = jobs.filter((job) => job.status === "PUBLISHED" && !inJobs.has(job.id));
  const salaryCurrency = profile?.currency === "TND" ? "TND" : "€";

  return (
    <AppShell role="RECRUITER" plain>
      <div className="mx-auto max-w-[1100px] pb-8">
        <button type="button" onClick={() => router.back()} className="text-sm font-semibold text-forest hover:underline">
          ← Retour
        </button>
        {error ? <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {!profile && !error ? <p className="mt-4 text-sm text-sage">Chargement…</p> : null}

        {profile ? (
          <div className="mt-4 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0 space-y-4">
              <section className={card}>
                <div className="flex items-start gap-5">
                  <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-tint text-xl font-bold text-forest">
                    {initials(profile.displayName)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-widest text-sage">
                      {imported ? "Profil importé" : profile.anonymous ? "Profil anonyme" : "Profil identifié"}
                    </p>
                    <h1 className="mt-1 text-3xl font-semibold tracking-tight">{profile.displayName}</h1>
                    <p className="mt-1 text-forest">{profile.headline || "Sans titre"}</p>
                    <p className="mt-1 text-sm text-sage">
                      {[profile.location || "Lieu non précisé", `${profile.experienceYears} an${profile.experienceYears > 1 ? "s" : ""} d'expérience`].join(" · ")}
                    </p>
                    <p className="mt-1 text-sm text-sage">
                      {profile.salaryMin
                        ? `Prétentions : ${profile.salaryMin.toLocaleString("fr-FR")}–${profile.salaryMax?.toLocaleString("fr-FR")} ${salaryCurrency}`
                        : "Prétentions non communiquées"}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                      {profile.email ? <span>{profile.email}</span> : null}
                      {profile.linkedinUrl ? (
                        <a href={profile.linkedinUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-forest hover:underline">
                          Profil LinkedIn
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>
              </section>

              {profile.bio ? (
                <section className={card}>
                  <h2 className="text-lg font-semibold">À propos</h2>
                  <p className="mt-2 text-sm leading-6">{profile.bio}</p>
                </section>
              ) : null}

              {profile.skills.length ? (
                <section className={card}>
                  <h2 className="text-lg font-semibold">Compétences</h2>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {profile.skills.map((skill) => (
                      <span key={skill} className="rounded-full border border-line px-3 py-1 text-sm">
                        {skill}
                      </span>
                    ))}
                  </div>
                </section>
              ) : null}

              {profile.experiences?.length ? (
                <section className={card}>
                  <h2 className="text-lg font-semibold">Expérience</h2>
                  <ul className="mt-3 space-y-3">
                    {profile.experiences.map((item) => (
                      <li key={item.id}>
                        <p className="text-sm font-semibold">
                          {item.title} · {item.company}
                          {item.current ? <span className="ml-2 rounded-full bg-tint px-2 py-0.5 text-xs text-forest">Actuel</span> : null}
                        </p>
                        {item.description ? <p className="mt-0.5 text-sm leading-6 text-sage">{item.description}</p> : null}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {profile.educations?.length ? (
                <section className={card}>
                  <h2 className="text-lg font-semibold">Formation</h2>
                  <ul className="mt-3 space-y-1.5 text-sm">
                    {profile.educations.map((item) => (
                      <li key={item.id}>{[item.degree, item.field, item.school].filter(Boolean).join(" · ")}</li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {imported ? <SourcedNote className="px-1" /> : null}
            </div>

            <aside className="space-y-4 lg:sticky lg:top-20">
              <section className={card}>
                <h2 className="text-base font-semibold">Candidatures</h2>
                {profile.applications?.length ? (
                  <ul className="mt-3 space-y-2 text-sm">
                    {profile.applications.map((item) => (
                      <li key={item.id} className="flex items-center justify-between gap-2">
                        <Link href={`/recruteur/pipeline/${item.job.id}`} className="min-w-0 truncate font-semibold text-forest hover:underline">
                          {item.job.title}
                        </Link>
                        <span className="shrink-0 rounded-full bg-paper px-2.5 py-0.5 text-xs text-sage">{STAGE_LABEL[item.stage] ?? item.stage}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-sage">Ce profil n&apos;est dans aucune de vos offres.</p>
                )}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <select
                    value={jobId}
                    onChange={(event) => setJobId(event.target.value)}
                    aria-label="Ajouter à une offre"
                    className="min-w-0 flex-1 rounded-full border border-line bg-white px-3 py-1.5 text-sm outline-none focus:border-forest"
                  >
                    <option value="">Ajouter à une offre…</option>
                    {addable.map((job) => (
                      <option key={job.id} value={job.id}>
                        {job.title}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={() => void addToJob()} disabled={!jobId} className={btnSolid}>
                    Ajouter
                  </button>
                </div>
                {notice ? <p className="mt-2 text-sm text-good">{notice}</p> : null}
              </section>

              {profile.own ? (
                <section className={card}>
                  <h2 className="text-base font-semibold">CV</h2>
                  {profile.cv?.hasFile ? (
                    <>
                      <p className="mt-1 truncate text-xs text-sage">{profile.cv.fileName}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" onClick={() => void openFile(false)} className={btnLine}>
                          Ouvrir
                        </button>
                        <button type="button" onClick={() => void openFile(true)} className={btnSolid}>
                          Télécharger
                        </button>
                      </div>
                    </>
                  ) : profile.cv?.text ? (
                    <>
                      <p className="mt-1 text-xs text-sage">Pas de fichier : texte du profil enregistré.</p>
                      <button type="button" onClick={() => setShowText((current) => !current)} className={`mt-3 ${btnLine}`}>
                        {showText ? "Masquer le texte" : "Lire le texte"}
                      </button>
                      {showText ? (
                        <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-paper p-3 font-sans text-xs leading-5">{profile.cv.text}</pre>
                      ) : null}
                    </>
                  ) : (
                    <p className="mt-2 text-sm text-sage">Aucun CV enregistré.</p>
                  )}
                  {fileError ? <p className="mt-2 text-sm text-red-700">{fileError}</p> : null}
                </section>
              ) : null}

              {profile.own ? (
                <section className={card}>
                  <h2 className="text-base font-semibold">Notes de l&apos;équipe</h2>
                  {!profile.applications?.length ? (
                    <p className="mt-2 text-sm text-sage">Ajoutez ce profil à une offre pour pouvoir prendre des notes.</p>
                  ) : (
                    <>
                      {profile.applications.length > 1 ? (
                        <select
                          value={appId}
                          onChange={(event) => setAppId(event.target.value)}
                          aria-label="Offre concernée par les notes"
                          className="mt-2 w-full rounded-full border border-line bg-white px-3 py-1.5 text-sm outline-none focus:border-forest"
                        >
                          {profile.applications.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.job.title}
                            </option>
                          ))}
                        </select>
                      ) : null}
                      <ul className="mt-3 space-y-3">
                        {notes.length === 0 ? <li className="text-sm text-sage">Aucune note pour l&apos;instant.</li> : null}
                        {notes.map((note) => (
                          <li key={note.id} className="rounded-xl bg-paper px-3 py-2">
                            <p className="whitespace-pre-wrap text-sm leading-5">{note.body}</p>
                            <p className="mt-1 text-xs text-sage">
                              {note.author.name} · {new Date(note.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                            </p>
                          </li>
                        ))}
                      </ul>
                      <textarea
                        value={draft}
                        onChange={(event) => setDraft(event.target.value.slice(0, 2000))}
                        rows={3}
                        placeholder="Ajouter une note pour l'équipe…"
                        aria-label="Nouvelle note"
                        className="mt-3 w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-forest focus:ring-2 focus:ring-forest/20"
                      />
                      {noteError ? <p className="mt-1 text-sm text-red-700">{noteError}</p> : null}
                      <button type="button" onClick={() => void addNote()} disabled={noteBusy || !draft.trim()} className={`mt-2 ${btnSolid}`}>
                        {noteBusy ? "Enregistrement…" : "Ajouter la note"}
                      </button>
                    </>
                  )}
                </section>
              ) : null}
            </aside>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
