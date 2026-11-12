"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Profile = {
  reverseRecruiting: boolean;
  anonymousVisible: boolean;
  salaryMin: number | null;
  salaryMax: number | null;
};

type ProfileView = {
  id: string;
  name: string;
  title: string | null;
  company: string | null;
  viewedAt: string;
  count: number;
};

export default function VisibilityPage() {
  const { token } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [views, setViews] = useState<ProfileView[] | null>(null);
  const [saved, setSaved] = useState("");

  useEffect(() => {
    if (!token) return;
    api<Profile>("/candidates/me", { token }).then(setProfile);
    api<ProfileView[]>("/candidates/me/views", { token }).then(setViews).catch(() => setViews([]));
  }, [token]);

  async function save(patch: Partial<Profile>) {
    if (!token || !profile) return;
    const next = { ...profile, ...patch };
    setProfile(next);
    await api("/candidates/me", { method: "PATCH", token, body: patch });
    setSaved("Préférences enregistrées.");
  }

  if (!profile) return <AppShell role="CANDIDATE" title="Candidature inversée">Chargement…</AppShell>;

  return (
    <AppShell role="CANDIDATE" title="Candidature inversée">
      <p className="max-w-xl text-sm text-forest/70">
        Rendez-vous visibles auprès des recruteurs, de façon anonyme, avec vos prétentions.
      </p>
      <div className="mt-6 max-w-xl space-y-4 rounded-2xl border border-line bg-cream p-5">
        <Toggle
          label="Apparaître dans le vivier recruteur"
          checked={profile.reverseRecruiting}
          onChange={(reverseRecruiting) => save({ reverseRecruiting })}
        />
        <Toggle
          label="Masquer mon nom (initiales uniquement)"
          checked={profile.anonymousVisible}
          onChange={(anonymousVisible) => save({ anonymousVisible })}
        />
        {saved ? <p className="text-sm text-good">{saved}</p> : null}
      </div>

      <section className="mt-6 max-w-xl rounded-2xl border border-line bg-cream p-5">
        <h2 className="text-base font-semibold">Qui a consulté votre profil</h2>
        {views === null ? <p className="mt-3 text-sm text-sage">Chargement…</p> : null}
        {views && views.length === 0 ? (
          <p className="mt-3 text-sm text-sage">Aucun recruteur n&apos;a encore ouvert votre profil.</p>
        ) : null}
        <ul className="mt-3 space-y-3">
          {(views ?? []).map((view) => (
            <li key={view.id} className="flex items-start justify-between gap-3 text-sm">
              <div>
                <p className="font-semibold">{view.name}</p>
                <p className="text-sage">{[view.title, view.company].filter(Boolean).join(" · ") || "Recruteur"}</p>
              </div>
              <p className="shrink-0 text-right text-xs text-sage">
                {seenAgo(view.viewedAt)}
                {view.count > 1 ? <span className="block">{view.count} consultations</span> : null}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </AppShell>
  );
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

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4 text-sm">
      {label}
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}
