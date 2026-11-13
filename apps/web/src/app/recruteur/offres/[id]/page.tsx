"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Job = {
  id: string;
  title: string;
  description: string;
  location: string;
  remote: boolean;
  contractType: string;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string;
  requiredSkills: string[];
  status: string;
  _count?: { applications: number };
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

const STATUS_HINT: Record<string, string> = {
  DRAFT: "Cette offre n'est pas visible des candidats.",
  PUBLISHED: "Les candidats peuvent la trouver et postuler.",
  PAUSED: "Masquée des candidats. Les candidatures déjà reçues restent dans le pipeline.",
  CLOSED: "Fermée : elle n'accepte plus de candidatures.",
};

const fieldClass =
  "w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-forest focus:ring-2 focus:ring-forest/20";

export default function RecruiterOfferPage() {
  const params = useParams<{ id: string }>();
  const { token, user } = useAuth();
  const [job, setJob] = useState<Job | null>(null);
  const [missing, setMissing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) return;
    api<Job[]>(`/jobs/mine`, { token })
      .then((jobs) => {
        const found = jobs.find((item) => item.id === params.id);
        if (!found) setMissing(true);
        else setJob(found);
      })
      .catch(() => setMissing(true));
  }, [token, params.id]);

  const company = user?.recruiter?.company?.name;
  const count = job?._count?.applications ?? 0;

  async function patch(body: Record<string, unknown>, success: string) {
    if (!token || !job) return false;
    setSaving(true);
    setMessage("");
    try {
      const updated = await api<Job>(`/jobs/${job.id}`, { method: "PATCH", token, body });
      setJob((current) => (current ? { ...current, ...updated } : updated));
      setMessage(success);
      return true;
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Modification impossible.");
      return false;
    } finally {
      setSaving(false);
      setConfirmClose(false);
    }
  }

  async function saveEdits(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!job) return;
    const form = new FormData(event.currentTarget);
    const monthly = job.currency === "TND";
    const num = (value: FormDataEntryValue | null) => {
      const n = Number(String(value ?? "").replace(",", "."));
      return Number.isFinite(n) && n > 0 ? Math.round(monthly ? n * 12 : n) : null;
    };
    const skills = String(form.get("skills") ?? "")
      .split(",")
      .map((skill) => skill.trim())
      .filter(Boolean);
    const body: Record<string, unknown> = {
      title: String(form.get("title") ?? "").trim(),
      location: String(form.get("location") ?? "").trim(),
      contractType: String(form.get("contractType") ?? job.contractType),
      remote: form.get("remote") === "on",
      description: String(form.get("description") ?? "").trim(),
      requiredSkills: skills,
    };
    const min = num(form.get("salaryMin"));
    const max = num(form.get("salaryMax"));
    if (min !== null) body.salaryMin = min;
    if (max !== null) body.salaryMax = max;
    if (String(body.title).length < 3 || String(body.description).length < 20 || !body.location || skills.length === 0) {
      setMessage("Le titre, le lieu, la mission (20 caractères) et au moins une compétence sont nécessaires.");
      return;
    }
    if (await patch(body, "Offre mise à jour.")) setEditing(false);
  }

  const actions: { label: string; status: string; tone: "primary" | "outline" | "danger" }[] = !job
    ? []
    : job.status === "PUBLISHED"
      ? [
          { label: "Mettre en pause", status: "PAUSED", tone: "outline" },
          { label: "Clôturer l'offre", status: "CLOSED", tone: "danger" },
        ]
      : job.status === "PAUSED"
        ? [
            { label: "Republier", status: "PUBLISHED", tone: "primary" },
            { label: "Clôturer l'offre", status: "CLOSED", tone: "danger" },
          ]
        : job.status === "CLOSED"
          ? [{ label: "Rouvrir l'offre", status: "PUBLISHED", tone: "primary" }]
          : [{ label: "Publier l'offre", status: "PUBLISHED", tone: "primary" }];

  return (
    <AppShell role="RECRUITER" plain>
      <div className="mx-auto max-w-[1100px]">
        <Link href="/recruteur" className="text-sm font-semibold text-forest hover:underline">
          ← Retour aux offres
        </Link>
        {missing ? <p className="mt-4 text-sm text-sage">Cette offre est introuvable.</p> : null}
        {!job && !missing ? <p className="mt-4 text-sm text-sage">Chargement…</p> : null}
        {job ? (
          <div className="mt-4 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            {editing ? (
              <form onSubmit={saveEdits} className="space-y-4 rounded-2xl border border-line bg-white p-8">
                <h1 className="text-2xl font-semibold tracking-tight">Modifier l&apos;offre</h1>
                <label className="block text-sm font-medium">
                  Titre
                  <input name="title" defaultValue={job.title} className={`mt-1 ${fieldClass}`} />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-medium">
                    Lieu
                    <input name="location" defaultValue={job.location} className={`mt-1 ${fieldClass}`} />
                  </label>
                  <label className="block text-sm font-medium">
                    Contrat
                    <select name="contractType" defaultValue={job.contractType} className={`mt-1 ${fieldClass}`}>
                      {["CDI", "CDD", "Stage", "Freelance"].map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input name="remote" type="checkbox" defaultChecked={job.remote} className="h-4 w-4 accent-[#1a3585]" />
                  Télétravail possible
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-medium">
                    Salaire min ({job.currency === "TND" ? "DT / mois" : "€ / an"})
                    <input
                      name="salaryMin"
                      type="number"
                      min={0}
                      defaultValue={job.salaryMin ? (job.currency === "TND" ? Math.round(job.salaryMin / 12) : job.salaryMin) : ""}
                      className={`mt-1 ${fieldClass}`}
                    />
                  </label>
                  <label className="block text-sm font-medium">
                    Salaire max
                    <input
                      name="salaryMax"
                      type="number"
                      min={0}
                      defaultValue={job.salaryMax ? (job.currency === "TND" ? Math.round(job.salaryMax / 12) : job.salaryMax) : ""}
                      className={`mt-1 ${fieldClass}`}
                    />
                  </label>
                </div>
                <label className="block text-sm font-medium">
                  Compétences (séparées par des virgules)
                  <input name="skills" defaultValue={job.requiredSkills.join(", ")} className={`mt-1 ${fieldClass}`} />
                </label>
                <label className="block text-sm font-medium">
                  Mission
                  <textarea name="description" rows={8} defaultValue={job.description} className={`mt-1 ${fieldClass}`} />
                </label>
                {message ? <p className="text-sm text-warn">{message}</p> : null}
                <div className="flex gap-3">
                  <button disabled={saving} className="rounded-full bg-forest px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
                    {saving ? "Enregistrement…" : "Enregistrer"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(false);
                      setMessage("");
                    }}
                    className="rounded-full px-5 py-2.5 text-sm font-semibold text-sage hover:text-ink"
                  >
                    Annuler
                  </button>
                </div>
              </form>
            ) : (
              <article className="rounded-2xl border border-line bg-white p-8">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    {company ? <p className="text-sm font-medium text-forest">{company}</p> : null}
                    <h1 className="mt-1 text-3xl font-semibold leading-tight tracking-tight">{job.title}</h1>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLE[job.status] ?? "bg-paper text-sage"}`}>
                    {STATUS[job.status] ?? job.status}
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2 text-sm">
                  <span className="rounded-full bg-tint px-3 py-1 font-medium text-forest">{job.contractType}</span>
                  <span className="rounded-full bg-paper px-3 py-1">{job.location}</span>
                  {job.remote ? <span className="rounded-full bg-paper px-3 py-1">Télétravail possible</span> : null}
                  <span className="rounded-full bg-paper px-3 py-1">{pay(job)}</span>
                </div>
                <hr className="my-6 border-line" />
                <h2 className="text-lg font-semibold">Mission</h2>
                <p className="mt-3 whitespace-pre-wrap leading-7">{job.description}</p>
                {job.requiredSkills.length > 0 ? (
                  <>
                    <h2 className="mt-8 text-lg font-semibold">Compétences demandées</h2>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {job.requiredSkills.map((skill) => (
                        <span key={skill} className="rounded-full border border-line px-3 py-1.5 text-sm font-medium">
                          {skill}
                        </span>
                      ))}
                    </div>
                  </>
                ) : null}
              </article>
            )}

            <aside className="space-y-3 lg:sticky lg:top-20">
              <section className="rounded-2xl border border-line bg-cream p-5">
                <p className="text-sm text-sage">Candidatures reçues</p>
                <p className="mt-1 text-4xl font-bold text-forest">{count}</p>
                <Link
                  href={`/recruteur/pipeline/${job.id}`}
                  className="mt-4 block rounded-full bg-forest py-2.5 text-center text-sm font-semibold text-white"
                >
                  Ouvrir le pipeline
                </Link>
                <Link
                  href={`/recruteur/matching/${job.id}`}
                  className="mt-2 block rounded-full border border-forest py-2.5 text-center text-sm font-semibold text-forest hover:bg-tint"
                >
                  Profils proches
                </Link>
              </section>

              <section className="rounded-2xl border border-line bg-cream p-5">
                <h2 className="text-base font-semibold">Gérer l&apos;offre</h2>
                <p className="mt-1 text-xs leading-5 text-sage">{STATUS_HINT[job.status]}</p>
                <div className="mt-4 space-y-2">
                  {actions.map((action) => {
                    const closing = action.status === "CLOSED";
                    const label = closing && confirmClose ? "Confirmer la clôture" : action.label;
                    return (
                      <button
                        key={action.label}
                        type="button"
                        disabled={saving}
                        onClick={() => {
                          if (closing && !confirmClose) {
                            setConfirmClose(true);
                            return;
                          }
                          void patch({ status: action.status }, `Offre : ${STATUS[action.status].toLowerCase()}.`);
                        }}
                        onBlur={() => setConfirmClose(false)}
                        className={`w-full rounded-full px-4 py-2.5 text-sm font-semibold transition active:scale-95 disabled:opacity-60 ${
                          action.tone === "primary"
                            ? "bg-forest text-white"
                            : action.tone === "danger"
                              ? confirmClose
                                ? "bg-red-700 text-white"
                                : "border border-red-200 text-red-700 hover:bg-red-50"
                              : "border border-forest text-forest hover:bg-tint"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                  {!editing ? (
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(true);
                        setMessage("");
                      }}
                      className="w-full rounded-full border border-line px-4 py-2.5 text-sm font-semibold text-ink hover:bg-paper"
                    >
                      Modifier l&apos;offre
                    </button>
                  ) : null}
                </div>
                {message && !editing ? <p className="mt-3 text-sm font-medium text-forest">{message}</p> : null}
              </section>

              <section
                className={`rounded-2xl border border-line p-5 text-sm ${job.status === "PUBLISHED" ? "bg-cream" : "bg-paper opacity-60"}`}
                aria-disabled={job.status !== "PUBLISHED"}
              >
                <h2 className="text-base font-semibold">Aperçu candidat</h2>
                {job.status === "PUBLISHED" ? (
                  <>
                    <p className="mt-2 leading-6 text-sage">Voyez l&apos;offre telle qu&apos;un candidat la découvre.</p>
                    <Link href={`/offres/${job.id}`} className="mt-3 inline-block font-semibold text-forest hover:underline">
                      Voir l&apos;offre publique
                    </Link>
                  </>
                ) : (
                  <>
                    <p className="mt-2 leading-6 text-sage">
                      {job.status === "PAUSED"
                        ? "L'offre est en pause : les candidats ne peuvent plus la voir."
                        : "L'offre n'est pas publiée : les candidats ne peuvent pas la voir."}
                    </p>
                    <span className="mt-3 inline-block cursor-not-allowed font-semibold text-sage">Voir l&apos;offre publique</span>
                  </>
                )}
              </section>
            </aside>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}

function pay(job: Job) {
  if (!job.salaryMin) return "Salaire non précisé";
  if (job.currency === "TND") {
    const min = Math.round(job.salaryMin / 12).toLocaleString("fr-FR");
    const max = job.salaryMax ? Math.round(job.salaryMax / 12).toLocaleString("fr-FR") : null;
    return max ? `${min}–${max} DT / mois` : `${min} DT / mois`;
  }
  const min = job.salaryMin.toLocaleString("fr-FR");
  const max = job.salaryMax ? job.salaryMax.toLocaleString("fr-FR") : null;
  return max ? `${min}–${max} € / an` : `${min} € / an`;
}
