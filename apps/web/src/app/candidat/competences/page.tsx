"use client";

import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Gap = { id: string; skill: string; currentLevel: number; marketLevel: number; recommendedTraining: string };

type OfferGap = {
  required: number;
  covered: number;
  items: { skill: string; present: boolean; currentLevel: number }[];
};

export default function SkillsPage() {
  const { token } = useAuth();
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [offer, setOffer] = useState("");
  const [result, setResult] = useState<OfferGap | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!token) return;
    api<{ skillGaps: Gap[] }>("/candidates/me", { token }).then((profile) => setGaps(profile.skillGaps ?? []));
  }, [token]);

  async function compare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setPending(true);
    setError("");
    try {
      setResult(await api<OfferGap>("/ai/skill-gap", { token, body: { description: offer } }));
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "Comparaison impossible.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AppShell role="CANDIDATE" plain>
      <div className="mx-auto max-w-2xl">
        <h1 className="text-lg font-semibold">Écarts de compétences</h1>
        <p className="mt-1 text-sm text-sage">
          Comparez votre profil au marché, ou collez une offre pour voir ce qui manque.
        </p>

        <form onSubmit={compare} className="mt-5 rounded-xl border border-line bg-cream px-4 py-4">
          <label className="text-sm font-semibold" htmlFor="offer">
            Description de l&apos;offre
          </label>
          <textarea
            id="offer"
            value={offer}
            onChange={(event) => setOffer(event.target.value)}
            required
            minLength={40}
            rows={8}
            placeholder="Collez ici l'annonce : missions, stack, niveau attendu…"
            className="mt-2 min-h-40 w-full rounded-xl border border-line bg-paper p-3 text-sm outline-none ring-forest focus:ring-2"
          />
          <button
            disabled={pending || offer.trim().length < 40}
            className="mt-3 rounded-lg bg-forest px-3 py-1.5 text-xs font-semibold text-cream disabled:opacity-50"
          >
            {pending ? "Lecture…" : "Voir l'écart"}
          </button>
          {error ? <p className="mt-2 text-sm text-warn">{error}</p> : null}
        </form>

        {result ? (
          <section className="mt-4 rounded-xl border border-line bg-cream px-4 py-4">
            <p className="text-sm font-semibold">
              {result.required
                ? `${result.covered} compétence${result.covered > 1 ? "s" : ""} sur ${result.required} déjà dans votre profil`
                : "Aucune compétence reconnue dans ce texte."}
            </p>
            {result.required ? (
              <ul className="mt-3 space-y-3">
                {result.items.map((item) => (
                  <li key={item.skill}>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium">{item.skill}</span>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${item.present ? "bg-[#e7f6ee] text-[#145c40]" : "bg-[#fff4e5] text-warn"}`}>
                        {item.present ? "Déjà là" : "Manquante"}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-paper">
                      <div className={`h-full rounded-full ${item.present ? "bg-good" : "bg-warn"}`} style={{ width: item.present ? "100%" : "18%" }} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-sage">Ajoutez les technologies demandées dans l&apos;annonce, puis relancez.</p>
            )}
          </section>
        ) : null}

        <section className="mt-8">
          <h2 className="text-sm font-semibold">Face au marché</h2>
          <ul className="mt-3 space-y-4">
            {gaps.length === 0 ? <li className="text-sm text-sage">Aucun écart calculé pour le moment.</li> : null}
            {gaps.map((gap) => (
              <li key={gap.id}>
                <div className="flex justify-between gap-3 text-sm">
                  <span className="font-medium">{gap.skill}</span>
                  <span className="text-sage">
                    Vous {gap.currentLevel}% · marché {gap.marketLevel}%
                  </span>
                </div>
                <div className="relative mt-2 h-1.5 overflow-hidden rounded-full bg-paper">
                  <div className="absolute h-full bg-line" style={{ width: `${gap.marketLevel}%` }} />
                  <div className="absolute h-full bg-forest" style={{ width: `${gap.currentLevel}%` }} />
                </div>
                <p className="mt-1.5 text-sm text-sage">{gap.recommendedTraining}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
