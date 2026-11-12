"use client";

import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card, EmptyState, PageHeader, Skeleton, Switch } from "@/components/candidate-ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Profile = {
  reverseRecruiting: boolean;
  anonymousVisible: boolean;
  salaryMin: number | null;
  salaryMax: number | null;
  currency?: string;
  headline?: string | null;
  location?: string | null;
  skills?: string[];
  experienceYears?: number;
};

type ProfileView = {
  id: string;
  name: string;
  title: string | null;
  company: string | null;
  viewedAt: string;
  count: number;
};

type Preference = "reverseRecruiting" | "anonymousVisible";

export default function VisibilityPage() {
  const { token, user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [views, setViews] = useState<ProfileView[] | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState<Preference | "">("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!token) return;
    api<Profile>("/candidates/me", { token }).then(setProfile).catch(() => setNotice({ tone: "error", text: "Profil indisponible." }));
    api<ProfileView[]>("/candidates/me/views", { token }).then(setViews).catch(() => setViews([]));
    return () => clearTimeout(timer.current);
  }, [token]);

  function flash(tone: "ok" | "error", text: string) {
    setNotice({ tone, text });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setNotice(null), 3500);
  }

  async function save(key: Preference, value: boolean) {
    if (!token || !profile || busy) return;
    const previous = profile;
    setProfile({ ...profile, [key]: value });
    setBusy(key);
    try {
      await api("/candidates/me", { method: "PATCH", token, body: { [key]: value } });
      flash("ok", "Préférence enregistrée.");
    } catch {
      setProfile(previous);
      flash("error", "Enregistrement impossible : votre choix n'a pas été modifié.");
    } finally {
      setBusy("");
    }
  }

  const fullName = user ? `${user.firstName} ${user.lastName}` : "Vous";
  const initials = user ? `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase() : "?";

  return (
    <AppShell role="CANDIDATE" plain>
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Candidature inversée" intro="Laissez les recruteurs venir à vous : votre profil devient visible dans leur vivier, avec vos prétentions." />

        {!profile ? (
          <div className="space-y-4">
            <Skeleton className="h-40" />
            <Skeleton className="h-48" />
          </div>
        ) : (
          <>
            <Card className="space-y-5">
              <Switch
                label="Apparaître dans le vivier recruteur"
                description="Les recruteurs peuvent vous trouver par compétences et vous contacter. Vous pouvez désactiver cette option à tout moment."
                checked={profile.reverseRecruiting}
                busy={busy === "reverseRecruiting"}
                onChange={(value) => void save("reverseRecruiting", value)}
              />
              <div className="border-t border-line" />
              <Switch
                label="Masquer mon nom"
                description="Les recruteurs voient vos initiales, votre titre et vos compétences, mais pas votre nom complet."
                checked={profile.anonymousVisible}
                busy={busy === "anonymousVisible"}
                onChange={(value) => void save("anonymousVisible", value)}
              />
              <p role="status" aria-live="polite" className={`min-h-5 text-sm ${notice?.tone === "error" ? "text-red-700" : "text-good"}`}>
                {notice?.text ?? ""}
              </p>
            </Card>

            <section className="mt-6" aria-labelledby="preview-title">
              <h2 id="preview-title" className="text-lg font-semibold">
                Ce que voit un recruteur
              </h2>
              <p className="mt-1 text-sm text-sage">
                {profile.reverseRecruiting ? "Aperçu de votre fiche dans leur vivier." : "Votre profil n'est pas visible tant que l'option ci-dessus est désactivée."}
              </p>
              <div className={`mt-3 rounded-2xl border border-line bg-white p-5 transition ${profile.reverseRecruiting ? "" : "opacity-50 grayscale"}`}>
                <div className="flex items-start gap-3">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-tint text-sm font-bold text-forest">{initials}</span>
                  <div className="min-w-0">
                    <p className="font-semibold">{profile.anonymousVisible ? `${initials} · Profil anonyme` : fullName}</p>
                    <p className="text-sm text-sage">
                      {profile.headline || "Titre non renseigné"}
                      {profile.location ? ` · ${profile.location}` : ""}
                      {profile.experienceYears ? ` · ${profile.experienceYears} an${profile.experienceYears > 1 ? "s" : ""}` : ""}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-sm">{salaryLine(profile)}</p>
                {profile.skills && profile.skills.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {profile.skills.slice(0, 10).map((skill) => (
                      <span key={skill} className="rounded-full bg-paper px-2.5 py-1 text-xs font-medium">
                        {skill}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-sage">Aucune compétence renseignée : vous apparaîtrez peu dans les recherches.</p>
                )}
              </div>
            </section>
          </>
        )}

        <section className="mt-8" aria-labelledby="views-title">
          <h2 id="views-title" className="text-lg font-semibold">
            Qui a consulté votre profil
          </h2>
          <div className="mt-3">
            {views === null ? <Skeleton className="h-24" /> : null}
            {views && views.length === 0 ? (
              <EmptyState title="Aucune consultation pour l'instant" text="Quand un recruteur ouvrira votre profil, il apparaîtra ici. Un profil complet et visible est consulté plus souvent." />
            ) : null}
            {views && views.length > 0 ? (
              <ul className="divide-y divide-line rounded-2xl border border-line bg-white">
                {views.map((view) => (
                  <li key={view.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-tint text-xs font-semibold text-forest">{initialsOf(view.name)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{view.name}</p>
                      <p className="truncate text-sm text-sage">{[view.title, view.company].filter(Boolean).join(" · ") || "Recruteur"}</p>
                    </div>
                    <p className="shrink-0 text-right text-xs text-sage">
                      {seenAgo(view.viewedAt)}
                      {view.count > 1 ? <span className="block">{view.count} consultations</span> : null}
                    </p>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function salaryLine(profile: Profile) {
  if (!profile.salaryMin) return "Prétentions non communiquées";
  const max = profile.salaryMax ?? profile.salaryMin;
  const unit = profile.currency === "TND" ? "DT / an" : "€ / an";
  return `Prétentions : ${profile.salaryMin.toLocaleString("fr-FR")} – ${max.toLocaleString("fr-FR")} ${unit}`;
}

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function seenAgo(iso: string) {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `il y a ${days} j`;
  return new Date(iso).toLocaleDateString("fr-FR");
}
