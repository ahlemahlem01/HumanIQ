"use client";

import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { api, mediaUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Member = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  title: string | null;
  avatarImage: string | null;
  me: boolean;
  pending: boolean;
};

type Team = { company: { name: string; seats: number }; members: Member[] };

type InviteResult = {
  member: Member;
  delivered: boolean;
  resetPath?: string;
  detail?: string;
};

const fieldClass =
  "w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-forest focus:ring-2 focus:ring-forest/20";

export default function TeamPage() {
  const { token } = useAuth();
  const [team, setTeam] = useState<Team | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [fallbackLink, setFallbackLink] = useState("");
  const [pending, setPending] = useState(false);

  async function load() {
    if (!token) return;
    setTeam(await api<Team>("/recruiters/team", { token }));
  }

  useEffect(() => {
    load().catch(() => setError("Impossible de charger l'équipe."));
  }, [token]);

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setPending(true);
    setError("");
    setNotice("");
    setFallbackLink("");
    try {
      const result = await api<InviteResult>("/recruiters/team", {
        method: "POST",
        token,
        body: {
          email: String(form.get("email") ?? ""),
          firstName: String(form.get("firstName") ?? ""),
          lastName: String(form.get("lastName") ?? ""),
          title: String(form.get("title") ?? ""),
        },
      });
      formElement.reset();
      if (result.delivered) {
        setNotice(`Invitation envoyée à ${result.member.email}.`);
      } else {
        setNotice(`Compte créé pour ${result.member.email}, mais l'e-mail n'a pas pu partir.`);
        if (result.resetPath) setFallbackLink(`${window.location.origin}${result.resetPath}`);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invitation impossible.");
    } finally {
      setPending(false);
    }
  }

  const used = team?.members.length ?? 0;
  const seats = team?.company.seats ?? 0;
  const full = seats > 0 && used >= seats;

  return (
    <AppShell role="RECRUITER" plain>
      <div className="mx-auto grid max-w-[1100px] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <header>
            <h1 className="text-3xl font-semibold tracking-tight">Équipe</h1>
            <p className="mt-1 max-w-xl text-sage">
              Les membres de {team?.company.name || "votre entreprise"} partagent les offres, les pipelines, les tests, les entretiens et les notes internes.
            </p>
          </header>

          <div className="mt-5 rounded-2xl border border-line bg-white p-5">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium">Sièges utilisés</span>
              <span className="font-semibold">
                {team ? `${used} sur ${seats}` : "–"}
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full" style={{ background: "#e1e8f6" }}>
              <div
                className="h-full rounded-full bg-forest transition-[width] duration-700 ease-out"
                style={{ width: `${seats ? Math.min(100, (used / seats) * 100) : 0}%` }}
              />
            </div>
          </div>

          <ul className="mt-4 overflow-hidden rounded-2xl border border-line bg-white">
            {team === null && !error ? <li className="p-6 text-sm text-sage">Chargement…</li> : null}
            {team?.members.map((member) => (
              <li key={member.id} className="flex items-center gap-4 border-b border-line p-5 last:border-b-0">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-forest text-sm font-semibold text-white">
                  {member.avatarImage ? (
                    <img src={mediaUrl(`/uploads/avatars/${member.avatarImage}`)} alt="" className="h-full w-full object-cover" />
                  ) : (
                    `${member.firstName[0] ?? ""}${member.lastName[0] ?? ""}`.toUpperCase()
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {member.firstName} {member.lastName}
                    {member.me ? <span className="ml-2 rounded-full bg-tint px-2 py-0.5 text-xs font-semibold text-forest">Vous</span> : null}
                  </p>
                  <p className="truncate text-sm text-sage">{member.title || "Recruteur"}</p>
                  <p className="truncate text-xs text-sage">{member.email}</p>
                </div>
                {member.pending ? (
                  <span className="shrink-0 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-warn">Invitation en attente</span>
                ) : (
                  <span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-good">Actif</span>
                )}
              </li>
            ))}
          </ul>
          {error && !team ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
        </div>

        <aside className="space-y-3 lg:sticky lg:top-20">
          <form onSubmit={invite} className="space-y-3 rounded-2xl border border-line bg-cream p-5">
            <h2 className="text-lg font-semibold">Inviter un collègue</h2>
            <p className="text-xs leading-5 text-sage">
              Il reçoit un e-mail avec un lien pour choisir son mot de passe (valable 7 jours).
            </p>
            <div className="grid grid-cols-2 gap-3">
              <input name="firstName" required placeholder="Prénom" className={fieldClass} />
              <input name="lastName" required placeholder="Nom" className={fieldClass} />
            </div>
            <input name="email" type="email" required placeholder="E-mail professionnel" className={fieldClass} />
            <input name="title" placeholder="Poste (facultatif)" className={fieldClass} />
            <button
              disabled={pending || full}
              className="w-full rounded-full bg-forest py-2.5 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-60"
            >
              {pending ? "Envoi…" : full ? "Tous les sièges sont utilisés" : "Envoyer l'invitation"}
            </button>
            {error && team ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
            {notice ? <p className="rounded-xl bg-tint px-3 py-2 text-sm font-medium text-forest">{notice}</p> : null}
            {fallbackLink ? (
              <p className="break-all rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-warn">
                Transmettez-lui ce lien directement : {fallbackLink}
              </p>
            ) : null}
          </form>
        </aside>
      </div>
    </AppShell>
  );
}
