"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { api, mediaUrl, upload } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Experience = {
  id: string;
  title: string;
  company: string;
  location: string | null;
  startDate: string;
  endDate: string | null;
  current: boolean;
  description: string | null;
};

type Education = {
  id: string;
  school: string;
  degree: string | null;
  field: string | null;
  startDate: string | null;
  endDate: string | null;
  description: string | null;
};

type Profile = {
  headline: string | null;
  bio: string | null;
  location: string | null;
  experienceYears: number;
  skills: string[];
  linkedinUrl: string | null;
  coverImage: string | null;
  avatarImage: string | null;
  reverseRecruiting?: boolean;
  user: { firstName: string; lastName: string; email: string };
  experiences: Experience[];
  educations: Education[];
};

const inputClass = "w-full rounded-xl border border-line bg-cream px-3 py-2 text-sm outline-none ring-forest focus:ring-2";

export default function CandidateProfilePage() {
  const { token } = useAuth();
  const fileInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const avatarInput = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [notice, setNotice] = useState("");
  const [views, setViews] = useState(0);

  async function reload() {
    if (!token) return;
    setProfile(await api<Profile>("/candidates/me", { token }));
  }

  async function uploadAvatar(file: File) {
    if (!token) return;
    setUploadingAvatar(true);
    setError("");
    try {
      await upload("/candidates/me/avatar", file, { token });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Photo de profil impossible à envoyer.");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function uploadCover(file: File) {
    if (!token) return;
    setUploadingCover(true);
    setError("");
    try {
      await upload("/candidates/me/cover", file, { token });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Image impossible à envoyer.");
    } finally {
      setUploadingCover(false);
    }
  }

  async function importCv(file: File) {
    if (!token) return;
    setImporting(true);
    setError("");
    setNotice("");
    try {
      await upload("/ai/cv/upload", file, { token });
      await reload();
      setNotice("Profil rempli à partir du CV.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import impossible.");
    } finally {
      setImporting(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    api<{ count: number }[]>("/candidates/me/views", { token })
      .then((rows) => setViews(rows.reduce((total, row) => total + row.count, 0)))
      .catch(() => setViews(0));
  }, [token]);

  useEffect(() => {
    reload().catch(() => setError("Profil indisponible."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (!profile) {
    return <AppShell role="CANDIDATE" title="Profil">{error || "Chargement…"}</AppShell>;
  }

  const name = `${profile.user.firstName} ${profile.user.lastName}`;
  const checks: [string, boolean][] = [
    ["Ajouter un titre", Boolean(profile.headline)],
    ["Rédiger un résumé", Boolean(profile.bio)],
    ["Indiquer votre lieu", Boolean(profile.location)],
    ["Ajouter une expérience", profile.experiences.length > 0],
    ["Ajouter une formation", profile.educations.length > 0],
    ["Lister vos compétences", profile.skills.length > 0],
  ];
  const strength = Math.round((checks.filter(([, done]) => done).length / checks.length) * 100);
  const currentJob = profile.experiences.find((item) => item.current) ?? profile.experiences[0];
  const lastSchool = profile.educations[0];

  return (
    <AppShell role="CANDIDATE" plain>
      <div className="mx-auto grid max-w-[1100px] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 space-y-3">
        <section className="rounded-xl border border-line bg-cream shadow-sm">
          <div className="relative h-44 overflow-hidden rounded-t-2xl bg-forest md:h-56">
            {profile.coverImage ? (
              <img
                src={mediaUrl(`/uploads/covers/${profile.coverImage}`)}
                alt="Photo de couverture"
                className="h-full w-full object-cover"
              />
            ) : null}
            <input
              ref={coverInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (file) void uploadCover(file);
              }}
            />
            <button
              type="button"
              disabled={uploadingCover}
              onClick={() => coverInput.current?.click()}
              className="absolute bottom-3 right-3 rounded-full bg-cream px-3 py-1.5 text-xs font-semibold text-forest shadow-sm disabled:opacity-60"
            >
              {uploadingCover ? "Envoi…" : profile.coverImage ? "Changer la photo" : "Ajouter une photo de couverture"}
            </button>
          </div>
          <div className="px-6 pb-6">
            <input
              ref={avatarInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (file) void uploadAvatar(file);
              }}
            />
            <button
              type="button"
              disabled={uploadingAvatar}
              onClick={() => avatarInput.current?.click()}
              aria-label={profile.avatarImage ? "Changer la photo de profil" : "Choisir une photo de profil"}
              className="group relative z-10 -mt-16 h-32 w-32 rounded-full border-4 border-white bg-forest text-4xl font-semibold text-white shadow-sm disabled:opacity-60 md:-mt-20 md:h-40 md:w-40"
            >
              <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full">
                {profile.avatarImage ? (
                  <img src={mediaUrl(`/uploads/avatars/${profile.avatarImage}`)} alt="" className="h-full w-full object-cover" />
                ) : (
                  initials(name)
                )}
              </span>
              <span className="absolute bottom-1 right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-forest text-white">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M4 8h3l2-2h6l2 2h3v11H4V8Z" strokeLinejoin="round" />
                  <circle cx="12" cy="13" r="3" />
                </svg>
              </span>
            </button>
            {editing === "intro" ? (
              <IntroForm
                profile={profile}
                onCancel={() => setEditing(null)}
                onSave={async (body) => {
                  if (!token) return;
                  await api("/candidates/me", { method: "PATCH", token, body });
                  await reload();
                  setEditing(null);
                }}
              />
            ) : (
              <div className="mt-3 flex items-start justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-semibold leading-tight">{name}</h1>
                  <p className="mt-1 text-base">{profile.headline || "Ajoutez un titre"}</p>
                  <p className="mt-1 text-sm text-sage">
                    {profile.location || "Ajoutez un lieu"}
                    {` · ${profile.experienceYears} ans d'expérience`}
                    {" · "}
                    <span>{profile.user.email}</span>
                  </p>
                  {profile.linkedinUrl ? (
                    <a href={profile.linkedinUrl} className="mt-1 inline-block text-sm font-semibold text-[#0b1f4b] hover:underline" target="_blank" rel="noreferrer">
                      Coordonnées
                    </a>
                  ) : null}
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <input
                      ref={fileInput}
                      type="file"
                      accept=".pdf,.docx,.txt,.md"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        event.currentTarget.value = "";
                        if (file) void importCv(file);
                      }}
                    />
                    <button
                      type="button"
                      disabled={importing}
                      onClick={() => fileInput.current?.click()}
                      className="rounded-full bg-forest px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      {importing ? "Lecture du CV…" : "Importer un CV"}
                    </button>
                    <Link href="/candidat/cv" className="rounded-full border border-forest px-5 py-2 text-sm font-semibold text-forest hover:bg-tint">
                      Voir mon CV
                    </Link>
                    <Link href="/candidat/visibilite" className="rounded-full border border-line px-5 py-2 text-sm font-semibold text-ink hover:bg-paper">
                      Visibilité
                    </Link>
                    {notice ? <p className="w-full text-sm text-forest">{notice}</p> : null}
                  </div>
                </div>
                <div className="flex shrink-0 items-start gap-3">
                  <div className="hidden space-y-2 text-sm font-medium md:block">
                    {currentJob ? (
                      <p className="flex items-center gap-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-md border border-line bg-paper text-[11px] font-semibold">{initials(currentJob.company)}</span>
                        {currentJob.company}
                      </p>
                    ) : null}
                    {lastSchool ? (
                      <p className="flex items-center gap-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-md border border-line bg-paper text-[11px] font-semibold">{initials(lastSchool.school)}</span>
                        {lastSchool.school}
                      </p>
                    ) : null}
                  </div>
                  <IconButton label="Modifier l'introduction" onClick={() => setEditing("intro")}>
                    <Pencil />
                  </IconButton>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-forest/30 bg-tint px-6 py-5">
          <h2 className="text-base font-semibold">
            {profile.reverseRecruiting ? "Ouvert aux opportunités" : "Dites aux recruteurs que vous cherchez"}
          </h2>
          <p className="mt-1 text-sm text-sage">
            {profile.reverseRecruiting
              ? "Les recruteurs peuvent vous trouver dans le vivier et vous contacter."
              : "Activez la candidature inversée pour apparaître dans le vivier des recruteurs."}
          </p>
          <Link href="/candidat/visibilite" className="mt-3 inline-block text-sm font-semibold text-forest hover:underline">
            {profile.reverseRecruiting ? "Gérer ma visibilité" : "Activer la visibilité"}
          </Link>
        </section>

        <Section
          title="À propos"
          action={editing === "about" ? undefined : () => setEditing("about")}
        >
          {editing === "about" ? (
            <AboutForm
              bio={profile.bio ?? ""}
              onCancel={() => setEditing(null)}
              onSave={async (bio) => {
                if (!token) return;
                await api("/candidates/me", { method: "PATCH", token, body: { bio } });
                await reload();
                setEditing(null);
              }}
            />
          ) : (
            <p className="whitespace-pre-wrap text-sm leading-6">{profile.bio || "Présentez votre parcours."}</p>
          )}
        </Section>

        <Section
          title="Expérience"
          action={editing === "experience-new" ? undefined : () => setEditing("experience-new")}
          actionLabel="Ajouter"
        >
          {editing === "experience-new" ? (
            <ExperienceForm
              onCancel={() => setEditing(null)}
              onSave={async (body) => {
                if (!token) return;
                await api("/candidates/me/experiences", { method: "POST", token, body });
                await reload();
                setEditing(null);
              }}
            />
          ) : null}
          <ul>
            {profile.experiences.length === 0 && editing !== "experience-new" ? (
              <li className="text-sm text-sage">Aucune expérience pour le moment.</li>
            ) : null}
            {profile.experiences.map((item) => (
              <li key={item.id} className="flex gap-3 border-b border-line py-4 last:border-b-0 last:pb-0">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-line bg-paper text-sm font-semibold">
                  {initials(item.company)}
                </div>
                <div className="min-w-0 flex-1">
                  {editing === item.id ? (
                    <ExperienceForm
                      item={item}
                      onCancel={() => setEditing(null)}
                      onSave={async (body) => {
                        if (!token) return;
                        await api(`/candidates/me/experiences/${item.id}`, { method: "PATCH", token, body });
                        await reload();
                        setEditing(null);
                      }}
                    />
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{item.title}</p>
                        <p className="text-sm">{item.company}</p>
                        <p className="text-sm text-sage">
                          {rangeLabel(item.startDate, item.endDate, item.current)}
                          {` · ${durationLabel(item.startDate, item.endDate, item.current)}`}
                        </p>
                        {item.location ? <p className="text-sm text-sage">{item.location}</p> : null}
                        {item.description ? <p className="mt-2 text-sm leading-6">{item.description}</p> : null}
                      </div>
                      <div className="flex gap-1">
                        <IconButton label="Modifier" onClick={() => setEditing(item.id)}>
                          <Pencil />
                        </IconButton>
                        <IconButton
                          label="Retirer"
                          onClick={async () => {
                            if (!token) return;
                            await api(`/candidates/me/experiences/${item.id}`, { method: "DELETE", token });
                            await reload();
                          }}
                        >
                          <CloseIcon />
                        </IconButton>
                      </div>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Section>

        <Section
          title="Formation"
          action={editing === "education-new" ? undefined : () => setEditing("education-new")}
          actionLabel="Ajouter"
        >
          {editing === "education-new" ? (
            <EducationForm
              onCancel={() => setEditing(null)}
              onSave={async (body) => {
                if (!token) return;
                await api("/candidates/me/educations", { method: "POST", token, body });
                await reload();
                setEditing(null);
              }}
            />
          ) : null}
          <ul>
            {profile.educations.length === 0 && editing !== "education-new" ? (
              <li className="text-sm text-sage">Aucune formation pour le moment.</li>
            ) : null}
            {profile.educations.map((item) => (
              <li key={item.id} className="flex gap-3 border-b border-line py-4 last:border-b-0 last:pb-0">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-line bg-paper text-sm font-semibold">
                  {initials(item.school)}
                </div>
                {editing === `edu-${item.id}` ? (
                  <div className="min-w-0 flex-1">
                    <EducationForm
                      item={item}
                      onCancel={() => setEditing(null)}
                      onSave={async (body) => {
                        if (!token) return;
                        await api(`/candidates/me/educations/${item.id}`, { method: "PATCH", token, body });
                        await reload();
                        setEditing(null);
                      }}
                    />
                  </div>
                ) : (
                  <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{item.school}</p>
                      <p className="text-sm">{[item.degree, item.field].filter(Boolean).join(", ") || "Formation"}</p>
                      <p className="text-sm text-sage">{rangeLabel(item.startDate, item.endDate, false)}</p>
                      {item.description ? <p className="mt-2 text-sm leading-6">{item.description}</p> : null}
                    </div>
                    <div className="flex gap-1">
                      <IconButton label="Modifier" onClick={() => setEditing(`edu-${item.id}`)}>
                        <Pencil />
                      </IconButton>
                      <IconButton
                        label="Retirer"
                        onClick={async () => {
                          if (!token) return;
                          await api(`/candidates/me/educations/${item.id}`, { method: "DELETE", token });
                          await reload();
                        }}
                      >
                        <CloseIcon />
                      </IconButton>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Compétences" action={editing === "skills" ? undefined : () => setEditing("skills")}>
          {editing === "skills" ? (
            <SkillsForm
              skills={profile.skills}
              onCancel={() => setEditing(null)}
              onSave={async (skills) => {
                if (!token) return;
                await api("/candidates/me", { method: "PATCH", token, body: { skills } });
                await reload();
                setEditing(null);
              }}
            />
          ) : profile.skills.length === 0 ? (
            <p className="text-sm text-sage">Ajoutez vos compétences.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {profile.skills.map((skill) => (
                <span key={skill} className="rounded-full border border-line bg-white px-3 py-1 text-sm font-medium">
                  {skill}
                </span>
              ))}
            </div>
          )}
        </Section>
        {error ? <p className="text-sm text-warn">{error}</p> : null}
      </div>

      <aside className="space-y-3 lg:sticky lg:top-20">
        <section className="rounded-2xl border border-line bg-cream p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Force du profil</h2>
            <span className="text-sm font-semibold text-forest">{strength}%</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-paper">
            <div className="h-full rounded-full bg-forest" style={{ width: `${strength}%` }} />
          </div>
          <ul className="mt-4 space-y-2 text-sm">
            {checks.map(([label, done]) => (
              <li key={label} className={`flex items-center gap-2 ${done ? "text-sage" : "font-medium"}`}>
                <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${done ? "bg-forest text-white" : "border border-line"}`}>
                  {done ? "✓" : ""}
                </span>
                {label}
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-2xl border border-line bg-cream p-5">
          <h2 className="text-base font-semibold">Analyse du profil</h2>
          <p className="mt-1 text-xs text-sage">Visible uniquement par vous</p>
          <Link href="/candidat/visibilite" className="mt-4 flex items-center gap-3">
            <span className="text-3xl font-bold text-forest">{views}</span>
            <span className="text-sm text-sage">vue{views > 1 ? "s" : ""} du profil par des recruteurs</span>
          </Link>
        </section>
        <section className="rounded-2xl border border-line bg-cream p-5 text-sm">
          <h2 className="text-base font-semibold">Aller plus loin</h2>
          <Link href="/candidat/ats" className="mt-3 block font-medium text-forest hover:underline">Score ATS de mon CV</Link>
          <Link href="/candidat/competences" className="mt-2 block font-medium text-forest hover:underline">Écarts de compétences</Link>
          <Link href="/candidat/salaire" className="mt-2 block font-medium text-forest hover:underline">Benchmark salarial</Link>
        </section>
      </aside>
      </div>
    </AppShell>
  );
}

function Section({
  title,
  action,
  actionLabel = "Modifier",
  children,
}: {
  title: string;
  action?: () => void;
  actionLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line bg-cream px-6 py-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xl font-semibold">{title}</h2>
        {action ? (
          <IconButton label={actionLabel} onClick={action}>
            {actionLabel === "Ajouter" ? <Plus /> : <Pencil />}
          </IconButton>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="rounded-full p-2 text-sage hover:bg-paper">
      {children}
    </button>
  );
}

function Pencil() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <path d="M4 20h4l10-10-4-4L4 16v4Z" strokeLinejoin="round" />
      <path d="m13 7 4 4" />
    </svg>
  );
}

function Plus() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <path d="M7 7l10 10M17 7 7 17" strokeLinecap="round" />
    </svg>
  );
}

function IntroForm({
  profile,
  onSave,
  onCancel,
}: {
  profile: Profile;
  onSave: (body: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}) {
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    await onSave({
      headline: String(form.get("headline")),
      location: String(form.get("location")),
      experienceYears: Number(form.get("experienceYears") || 0),
      linkedinUrl: String(form.get("linkedinUrl") || ""),
    });
    setPending(false);
  }
  return (
    <form onSubmit={submit} className="mt-4 grid gap-3">
      <input name="headline" defaultValue={profile.headline ?? ""} placeholder="Titre" className={inputClass} />
      <input name="location" defaultValue={profile.location ?? ""} placeholder="Lieu" className={inputClass} />
      <input name="experienceYears" type="number" min={0} defaultValue={profile.experienceYears} className={inputClass} />
      <input name="linkedinUrl" defaultValue={profile.linkedinUrl ?? ""} placeholder="Lien LinkedIn" className={inputClass} />
      <FormActions pending={pending} onCancel={onCancel} />
    </form>
  );
}

function AboutForm({
  bio,
  onSave,
  onCancel,
}: {
  bio: string;
  onSave: (bio: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [pending, setPending] = useState(false);
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        await onSave(String(new FormData(event.currentTarget).get("bio")));
        setPending(false);
      }}
      className="grid gap-3"
    >
      <textarea name="bio" defaultValue={bio} rows={5} className={inputClass} />
      <FormActions pending={pending} onCancel={onCancel} />
    </form>
  );
}

function ExperienceForm({
  item,
  onSave,
  onCancel,
}: {
  item?: Experience;
  onSave: (body: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}) {
  const [current, setCurrent] = useState(item?.current ?? false);
  const [pending, setPending] = useState(false);
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setPending(true);
        await onSave({
          title: String(form.get("title")),
          company: String(form.get("company")),
          location: String(form.get("location") || ""),
          startDate: monthIso(String(form.get("startDate"))),
          endDate: current ? undefined : monthIso(String(form.get("endDate") || "")),
          current,
          description: String(form.get("description") || ""),
        });
        setPending(false);
      }}
      className="mb-4 grid gap-3 rounded-3xl bg-paper p-3"
    >
      <input name="title" required minLength={2} defaultValue={item?.title} placeholder="Poste" className={inputClass} />
      <input name="company" required minLength={2} defaultValue={item?.company} placeholder="Entreprise" className={inputClass} />
      <input name="location" defaultValue={item?.location ?? ""} placeholder="Lieu" className={inputClass} />
      <div className="grid gap-3 sm:grid-cols-2">
        <input name="startDate" required type="month" defaultValue={monthValue(item?.startDate)} className={inputClass} />
        <input name="endDate" type="month" defaultValue={monthValue(item?.endDate)} disabled={current} className={inputClass} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={current} onChange={(event) => setCurrent(event.target.checked)} />
        Poste actuel
      </label>
      <textarea name="description" defaultValue={item?.description ?? ""} rows={3} placeholder="Description" className={inputClass} />
      <FormActions pending={pending} onCancel={onCancel} />
    </form>
  );
}

function EducationForm({
  item,
  onSave,
  onCancel,
}: {
  item?: Education;
  onSave: (body: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}) {
  const [pending, setPending] = useState(false);
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const start = monthIso(String(form.get("startDate") || ""));
        const end = monthIso(String(form.get("endDate") || ""));
        setPending(true);
        await onSave({
          school: String(form.get("school")),
          degree: String(form.get("degree") || ""),
          field: String(form.get("field") || ""),
          startDate: start || undefined,
          endDate: end || undefined,
          description: String(form.get("description") || ""),
        });
        setPending(false);
      }}
      className="mb-4 grid gap-3 rounded-3xl bg-paper p-3"
    >
      <input name="school" required minLength={2} defaultValue={item?.school} placeholder="École" className={inputClass} />
      <div className="grid gap-3 sm:grid-cols-2">
        <input name="degree" defaultValue={item?.degree ?? ""} placeholder="Diplôme" className={inputClass} />
        <input name="field" defaultValue={item?.field ?? ""} placeholder="Domaine" className={inputClass} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <input name="startDate" type="month" defaultValue={monthValue(item?.startDate)} className={inputClass} />
        <input name="endDate" type="month" defaultValue={monthValue(item?.endDate)} className={inputClass} />
      </div>
      <textarea name="description" defaultValue={item?.description ?? ""} rows={2} placeholder="Description" className={inputClass} />
      <FormActions pending={pending} onCancel={onCancel} />
    </form>
  );
}

function SkillsForm({
  skills,
  onSave,
  onCancel,
}: {
  skills: string[];
  onSave: (skills: string[]) => Promise<void>;
  onCancel: () => void;
}) {
  const [items, setItems] = useState(skills);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        await onSave(items);
        setPending(false);
      }}
      className="grid gap-3"
    >
      <div className="flex flex-wrap gap-2">
        {items.map((skill) => (
          <button
            key={skill}
            type="button"
            onClick={() => setItems((current) => current.filter((item) => item !== skill))}
            className="rounded-full bg-paper px-3 py-1 text-sm"
          >
            {skill} ×
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ajouter une compétence" className={inputClass} />
        <button
          type="button"
          className="rounded-full border border-line px-4 text-sm"
          onClick={() => {
            const next = draft.trim();
            if (!next || items.includes(next)) return;
            setItems((current) => [...current, next]);
            setDraft("");
          }}
        >
          Ajouter
        </button>
      </div>
      <FormActions pending={pending} onCancel={onCancel} />
    </form>
  );
}

function FormActions({ pending, onCancel }: { pending: boolean; onCancel: () => void }) {
  return (
    <div className="flex gap-2">
      <button disabled={pending} className="rounded-full bg-forest px-4 py-2 text-sm text-cream disabled:opacity-60">
        {pending ? "Enregistrement…" : "Enregistrer"}
      </button>
      <button type="button" onClick={onCancel} className="rounded-full px-4 py-2 text-sm">
        Annuler
      </button>
    </div>
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

function monthValue(iso?: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthIso(value: string) {
  return value ? `${value}-01` : "";
}

function durationLabel(start: string, end: string | null, current: boolean) {
  const from = new Date(start);
  const to = current || !end ? new Date() : new Date(end);
  const months = Math.max(1, (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth()));
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return [years ? `${years} an${years > 1 ? "s" : ""}` : "", rest ? `${rest} mois` : ""].filter(Boolean).join(" ");
}

function rangeLabel(start: string | null, end: string | null, current: boolean) {
  const startLabel = start ? monthLabel(start) : "";
  const endLabel = current ? "Aujourd'hui" : end ? monthLabel(end) : "";
  return [startLabel, endLabel].filter(Boolean).join(" – ");
}

function monthLabel(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
}
