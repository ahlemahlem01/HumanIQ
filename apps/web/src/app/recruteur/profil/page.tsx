"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { api, mediaUrl, upload } from "@/lib/api";

type Job = {
  id: string;
  title: string;
  status: string;
  location: string;
  contractType: string;
  remote: boolean;
  _count: { applications: number };
};

type Profile = {
  title: string | null;
  bio: string | null;
  location: string | null;
  phone: string | null;
  avatarImage: string | null;
  company: { name: string; description: string | null; website: string | null; logoUrl?: string | null; verifiedAt?: string | null };
  user: { firstName: string; lastName: string; email: string };
  jobs: Job[];
};

const STATUS: Record<string, string> = {
  DRAFT: "Brouillon",
  PUBLISHED: "Publiée",
  PAUSED: "En pause",
  CLOSED: "Fermée",
};

const STATUS_STYLE: Record<string, string> = {
  DRAFT: "bg-paper text-sage",
  PUBLISHED: "bg-emerald-50 text-good",
  PAUSED: "bg-amber-50 text-warn",
  CLOSED: "bg-red-50 text-red-700",
};

const inputClass =
  "w-full rounded-xl border border-line bg-cream px-3 py-2 text-sm outline-none focus:border-forest focus:ring-2 focus:ring-forest/20";

function initialsOf(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function RecruiterProfilePage() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [editing, setEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingCompany, setEditingCompany] = useState(false);
  const [companyError, setCompanyError] = useState("");
  const [companySaving, setCompanySaving] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);

  async function uploadLogo(file: File) {
    if (!token) return;
    setLogoBusy(true);
    setCompanyError("");
    try {
      setProfile(await upload<Profile>("/recruiters/company/logo", file, { token }));
    } catch (err) {
      setCompanyError(err instanceof Error ? err.message : "Logo impossible à envoyer.");
    } finally {
      setLogoBusy(false);
    }
  }

  async function removeLogo() {
    if (!token) return;
    setLogoBusy(true);
    try {
      setProfile(await api<Profile>("/recruiters/company/logo", { method: "DELETE", token }));
    } catch (err) {
      setCompanyError(err instanceof Error ? err.message : "Suppression impossible.");
    } finally {
      setLogoBusy(false);
    }
  }

  useEffect(() => {
    const stored = localStorage.getItem("nextgen_token");
    setToken(stored);
    if (!stored) return;
    api<Profile>("/recruiters/me", { token: stored })
      .then(setProfile)
      .catch(() => setError("Profil indisponible."));
  }, []);

  async function uploadAvatar(file: File) {
    if (!token) return;
    setUploading(true);
    setError("");
    try {
      const saved = await upload<{ avatarImage: string }>("/recruiters/me/avatar", file, { token });
      setProfile((current) => (current ? { ...current, avatarImage: saved.avatarImage } : current));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Photo de profil impossible à envoyer.");
    } finally {
      setUploading(false);
    }
  }

  async function saveCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !profile) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    if (name !== profile.company.name && profile.company.verifiedAt) {
      const ok = window.confirm(
        "Changer le nom de l'entreprise la remet « en attente de validation » : l'accès aux données des candidats et la visibilité de vos offres seront suspendus jusqu'à une nouvelle validation. Continuer ?",
      );
      if (!ok) return;
    }
    setCompanySaving(true);
    setCompanyError("");
    try {
      setProfile(
        await api<Profile>("/recruiters/company", {
          method: "PATCH",
          token,
          body: {
            name,
            description: String(form.get("description") ?? ""),
            website: String(form.get("website") ?? ""),
          },
        }),
      );
      setEditingCompany(false);
    } catch (err) {
      setCompanyError(err instanceof Error ? err.message : "Enregistrement impossible.");
    } finally {
      setCompanySaving(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      setProfile(
        await api<Profile>("/recruiters/me", {
          method: "PATCH",
          token,
          body: {
            title: String(form.get("title") ?? ""),
            location: String(form.get("location") ?? ""),
            phone: String(form.get("phone") ?? ""),
            bio: String(form.get("bio") ?? ""),
          },
        }),
      );
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  if (!profile) {
    return (
      <AppShell role="RECRUITER" plain>
        <p className="text-sm text-sage">{error || "Chargement…"}</p>
      </AppShell>
    );
  }

  const name = `${profile.user.firstName} ${profile.user.lastName}`;
  const openJobs = profile.jobs.filter((job) => job.status === "PUBLISHED");
  const applications = profile.jobs.reduce((total, job) => total + job._count.applications, 0);
  const checks: [string, boolean][] = [
    ["Ajouter un poste", Boolean(profile.title)],
    ["Indiquer votre lieu", Boolean(profile.location)],
    ["Ajouter un téléphone", Boolean(profile.phone)],
    ["Rédiger une présentation", Boolean(profile.bio)],
    ["Ajouter une photo", Boolean(profile.avatarImage)],
  ];
  const strength = Math.round((checks.filter(([, done]) => done).length / checks.length) * 100);

  return (
    <AppShell role="RECRUITER" plain>
      <div className="mx-auto grid max-w-[1100px] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-3">
          <section className="overflow-hidden rounded-2xl border border-line bg-cream">
            <div className="relative h-44 bg-forest md:h-56">
              <div className="absolute inset-0 flex flex-col items-end justify-end px-6 pb-5 text-right text-white">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/70">Recrutement</p>
                <p className="mt-1 text-xl font-semibold">{profile.company.name}</p>
              </div>
            </div>
            <div className="px-6 pb-6">
              <input
                ref={fileInput}
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
                disabled={uploading}
                onClick={() => fileInput.current?.click()}
                aria-label={profile.avatarImage ? "Changer la photo de profil" : "Choisir une photo de profil"}
                className="relative z-10 -mt-16 h-32 w-32 rounded-full border-4 border-white bg-forest text-4xl font-semibold text-white shadow-sm disabled:opacity-60 md:-mt-20 md:h-40 md:w-40"
              >
                <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full">
                  {profile.avatarImage ? (
                    <img src={mediaUrl(`/uploads/avatars/${profile.avatarImage}`)} alt="" className="h-full w-full object-cover" />
                  ) : (
                    initialsOf(name)
                  )}
                </span>
                <span className="absolute bottom-1 right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-forest text-white">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="M4 8h3l2-2h6l2 2h3v11H4V8Z" strokeLinejoin="round" />
                    <circle cx="12" cy="13" r="3" />
                  </svg>
                </span>
              </button>

              <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <h1 className="text-2xl font-semibold leading-tight">{name}</h1>
                  <p className="mt-1 text-base">
                    {profile.title || "Poste à préciser"} chez {profile.company.name}
                  </p>
                  <p className="mt-1 text-sm text-sage">
                    {profile.location || "Lieu à préciser"} · {profile.user.email}
                  </p>
                </div>
                <p className="flex items-center gap-2 text-sm font-medium">
                  <span className="flex h-9 w-9 items-center justify-center rounded-md border border-line bg-paper text-xs font-semibold">
                    {initialsOf(profile.company.name)}
                  </span>
                  {profile.company.name}
                </p>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditing((value) => !value)}
                  className="rounded-full bg-forest px-5 py-2 text-sm font-semibold text-white"
                >
                  {editing ? "Fermer" : "Modifier le profil"}
                </button>
                <Link href="/recruteur/offres/nouvelle" className="rounded-full border border-forest px-5 py-2 text-sm font-semibold text-forest hover:bg-tint">
                  Publier une offre
                </Link>
                <Link href="/recruteur/sourcing" className="rounded-full border border-line px-5 py-2 text-sm font-semibold text-ink hover:bg-paper">
                  Ouvrir le vivier
                </Link>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-forest/30 bg-tint px-6 py-5">
            <h2 className="text-base font-semibold">
              {openJobs.length > 0
                ? `Recrute actuellement : ${openJobs.length} offre${openJobs.length > 1 ? "s" : ""} publiée${openJobs.length > 1 ? "s" : ""}`
                : "Aucune offre publiée pour le moment"}
            </h2>
            <p className="mt-1 text-sm text-sage">
              {openJobs.length > 0
                ? `${applications} candidature${applications > 1 ? "s" : ""} reçue${applications > 1 ? "s" : ""} au total.`
                : "Publiez une offre pour recevoir des candidatures classées par l'IA."}
            </p>
            <Link href="/recruteur" className="mt-3 inline-block text-sm font-semibold text-forest hover:underline">
              Voir le tableau de bord
            </Link>
          </section>

          <section className="rounded-2xl border border-line bg-cream px-6 py-5">
            <h2 className="mb-2 text-xl font-semibold">À propos</h2>
            {editing ? (
              <form onSubmit={save} className="mt-4 space-y-3">
                <label className="block text-sm">
                  <span className="mb-1 block text-sage">Poste</span>
                  <input name="title" defaultValue={profile.title ?? ""} className={inputClass} maxLength={120} />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-sage">Lieu</span>
                  <input name="location" defaultValue={profile.location ?? ""} className={inputClass} maxLength={120} />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-sage">Téléphone</span>
                  <input name="phone" defaultValue={profile.phone ?? ""} className={inputClass} maxLength={40} />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-sage">Présentation</span>
                  <textarea name="bio" defaultValue={profile.bio ?? ""} rows={5} className={inputClass} maxLength={2000} />
                </label>
                {error ? <p className="text-sm text-warn">{error}</p> : null}
                <button type="submit" disabled={saving} className="rounded-full bg-forest px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">
                  {saving ? "Enregistrement…" : "Enregistrer"}
                </button>
              </form>
            ) : (
              <p className="whitespace-pre-wrap text-sm leading-6">
                {profile.bio || "Présentez votre rôle et les profils que vous recherchez."}
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-line bg-cream px-6 py-5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">Offres portées</h2>
              <Link href="/recruteur/offres/nouvelle" className="text-sm font-semibold text-forest hover:underline">
                Publier
              </Link>
            </div>
            {profile.jobs.length === 0 ? (
              <p className="mt-3 text-sm text-sage">Aucune offre pour le moment.</p>
            ) : (
              <ul className="divide-y divide-line">
                {profile.jobs.map((job) => (
                  <li key={job.id} className="flex gap-3 py-4 first:pt-2 last:pb-0">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-line bg-paper text-sm font-semibold">
                      {initialsOf(profile.company.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <Link href={`/recruteur/offres/${job.id}`} className="font-semibold hover:text-forest hover:underline">
                          {job.title}
                        </Link>
                        <span className={`shrink-0 rounded-full px-3 py-0.5 text-xs font-semibold ${STATUS_STYLE[job.status] ?? "bg-paper text-sage"}`}>
                          {STATUS[job.status] ?? job.status}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-sage">
                        {job.contractType}
                        {job.location ? ` · ${job.location}` : ""}
                        {job.remote ? " · Télétravail" : ""}
                        {` · ${job._count.applications} candidature${job._count.applications > 1 ? "s" : ""}`}
                      </p>
                      <Link href={`/recruteur/pipeline/${job.id}`} className="mt-1 inline-block text-sm font-semibold text-forest hover:underline">
                        Voir les candidatures
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {error && !editing ? <p className="text-sm text-warn">{error}</p> : null}
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
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
                      done ? "bg-forest text-white" : "border border-line"
                    }`}
                  >
                    {done ? "✓" : ""}
                  </span>
                  {label}
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-line bg-cream p-5">
            <h2 className="text-base font-semibold">Analyse</h2>
            <p className="mt-1 text-xs text-sage">Visible uniquement par vous</p>
            <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
              {[
                ["Publiées", openJobs.length],
                ["Offres", profile.jobs.length],
                ["Candidats", applications],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-paper px-2 py-3">
                  <dd className="text-xl font-bold text-forest">{value}</dd>
                  <dt className="text-xs text-sage">{label}</dt>
                </div>
              ))}
            </dl>
          </section>

          <section className="rounded-2xl border border-line bg-cream p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold">Entreprise</h2>
              {!editingCompany ? (
                <button type="button" onClick={() => setEditingCompany(true)} className="text-sm font-semibold text-forest hover:underline">
                  Modifier
                </button>
              ) : null}
            </div>
            {editingCompany ? (
              <form onSubmit={saveCompany} className="mt-3 space-y-3 text-sm">
                <div className="flex items-center gap-3">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-white text-xs font-bold">
                    {profile.company.logoUrl ? (
                      <img src={mediaUrl(profile.company.logoUrl)} alt="" className="h-full w-full object-contain" />
                    ) : (
                      initialsOf(profile.company.name)
                    )}
                  </span>
                  <div className="flex flex-col items-start gap-1">
                    <label className="cursor-pointer font-semibold text-forest hover:underline">
                      {logoBusy ? "Envoi…" : profile.company.logoUrl ? "Changer le logo" : "Ajouter un logo"}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="sr-only"
                        disabled={logoBusy}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.target.value = "";
                          if (file) void uploadLogo(file);
                        }}
                      />
                    </label>
                    {profile.company.logoUrl ? (
                      <button type="button" disabled={logoBusy} onClick={() => void removeLogo()} className="text-xs text-sage hover:text-red-700">
                        Retirer le logo
                      </button>
                    ) : (
                      <span className="text-xs text-sage">JPG, PNG ou WebP, 2 Mo maximum.</span>
                    )}
                  </div>
                </div>
                <label className="block font-medium">
                  Nom
                  <input
                    name="name"
                    required
                    minLength={2}
                    maxLength={120}
                    defaultValue={profile.company.name}
                    className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 outline-none focus:border-forest focus:ring-2 focus:ring-forest/20"
                  />
                </label>
                <label className="block font-medium">
                  Présentation
                  <textarea
                    name="description"
                    rows={4}
                    maxLength={2000}
                    defaultValue={profile.company.description ?? ""}
                    placeholder="Activité, taille de l'équipe, culture…"
                    className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 outline-none focus:border-forest focus:ring-2 focus:ring-forest/20"
                  />
                </label>
                <label className="block font-medium">
                  Site web
                  <input
                    name="website"
                    defaultValue={profile.company.website ?? ""}
                    placeholder="https://www.exemple.com"
                    className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 outline-none focus:border-forest focus:ring-2 focus:ring-forest/20"
                  />
                </label>
                {profile.company.verifiedAt ? (
                  <p className="text-xs leading-5 text-sage">Changer le nom exige une nouvelle validation de l&apos;entreprise.</p>
                ) : null}
                {companyError ? <p className="text-red-700">{companyError}</p> : null}
                <div className="flex gap-2">
                  <button disabled={companySaving} className="rounded-full bg-forest px-5 py-2 font-semibold text-white disabled:opacity-60">
                    {companySaving ? "Enregistrement…" : "Enregistrer"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCompany(false);
                      setCompanyError("");
                    }}
                    className="rounded-full border border-line px-5 py-2 font-semibold hover:border-forest"
                  >
                    Annuler
                  </button>
                </div>
              </form>
            ) : (
              <>
            <p className="mt-3 flex items-center gap-3 text-sm font-semibold">
              <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-md border border-line bg-paper text-xs font-bold">
                {profile.company.logoUrl ? (
                  <img src={mediaUrl(profile.company.logoUrl)} alt="" className="h-full w-full object-contain" />
                ) : (
                  initialsOf(profile.company.name)
                )}
              </span>
              {profile.company.name}
            </p>
            <p className="mt-3 text-sm leading-6 text-sage">
              {profile.company.description || "Présentation de l'entreprise à compléter."}
            </p>
            {profile.company.website ? (
              <a href={profile.company.website} className="mt-3 inline-block text-sm font-semibold text-forest hover:underline" target="_blank" rel="noreferrer">
                Site de l&apos;entreprise
              </a>
            ) : null}
              </>
            )}
          </section>

          <section className="rounded-2xl border border-line bg-cream p-5">
            <h2 className="text-base font-semibold">Coordonnées</h2>
            <dl className="mt-3 space-y-3 text-sm">
              <div>
                <dt className="text-xs text-sage">E-mail</dt>
                <dd className="mt-0.5 break-all">{profile.user.email}</dd>
              </div>
              <div>
                <dt className="text-xs text-sage">Téléphone</dt>
                <dd className="mt-0.5">{profile.phone || "Non précisé"}</dd>
              </div>
              <div>
                <dt className="text-xs text-sage">Basé à</dt>
                <dd className="mt-0.5">{profile.location || "Non précisé"}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}
