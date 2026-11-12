"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card, EmptyState, PageHeader, Pill, primaryButton, Skeleton } from "@/components/candidate-ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Gap = { id: string; skill: string; currentLevel: number; marketLevel: number; recommendedTraining: string };

type OfferGap = {
  required: number;
  covered: number;
  items: { skill: string; present: boolean; currentLevel: number }[];
};

type Me = { skillGaps?: Gap[]; skills?: string[] };

const MIN_CHARS = 40;

export default function SkillsPage() {
  const { token } = useAuth();
  const [gaps, setGaps] = useState<Gap[] | null>(null);
  const [skills, setSkills] = useState<string[]>([]);
  const [offer, setOffer] = useState("");
  const [result, setResult] = useState<OfferGap | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [adding, setAdding] = useState("");
  const [added, setAdded] = useState<string[]>([]);

  useEffect(() => {
    if (!token) return;
    api<Me>("/candidates/me", { token })
      .then((profile) => {
        setGaps(profile.skillGaps ?? []);
        setSkills(profile.skills ?? []);
      })
      .catch(() => setGaps([]));
  }, [token]);

  async function compare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setPending(true);
    setError("");
    setAdded([]);
    try {
      setResult(await api<OfferGap>("/ai/skill-gap", { token, body: { description: offer } }));
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "Comparaison impossible.");
    } finally {
      setPending(false);
    }
  }

  /** The candidate states they already have this skill: it joins their profile. Nothing is added on their behalf. */
  async function addSkill(skill: string) {
    if (!token || adding) return;
    setAdding(skill);
    setError("");
    try {
      const next = Array.from(new Set([...skills, skill]));
      await api("/candidates/me", { method: "PATCH", token, body: { skills: next } });
      setSkills(next);
      setAdded((current) => [...current, skill]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ajout impossible.");
    } finally {
      setAdding("");
    }
  }

  const items = result?.items.map((item) => ({ ...item, present: item.present || added.includes(item.skill) })) ?? [];
  const covered = items.filter((item) => item.present).length;
  const missing = items.filter((item) => !item.present);
  const have = items.filter((item) => item.present);
  const percent = items.length ? Math.round((covered / items.length) * 100) : 0;
  const ranked = [...(gaps ?? [])].sort((a, b) => b.marketLevel - b.currentLevel - (a.marketLevel - a.currentLevel));

  return (
    <AppShell role="CANDIDATE" plain>
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Écarts de compétences" intro="Collez une offre pour voir ce qu'il vous manque, ou comparez votre profil au marché." />

        <Card>
          <form onSubmit={compare}>
            <label className="text-sm font-semibold" htmlFor="offer">
              Offre qui vous intéresse
            </label>
            <textarea
              id="offer"
              value={offer}
              onChange={(event) => setOffer(event.target.value)}
              required
              minLength={MIN_CHARS}
              rows={7}
              placeholder="Collez ici l'annonce : missions, stack, niveau attendu…"
              className="mt-2 w-full resize-y rounded-xl border border-line bg-white p-3 text-sm leading-6 outline-none transition placeholder:text-sage/70 focus:border-forest focus:ring-4 focus:ring-forest/10"
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-sage">{offer.trim().length < MIN_CHARS ? `Encore ${MIN_CHARS - offer.trim().length} caractères minimum.` : "Prêt à comparer."}</p>
              <button disabled={pending || offer.trim().length < MIN_CHARS} className={primaryButton}>
                {pending ? "Lecture de l'offre…" : "Voir l'écart"}
              </button>
            </div>
            {error ? (
              <p role="alert" className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-warn">
                {error}
              </p>
            ) : null}
          </form>
        </Card>

        {result ? (
          <Card className="mt-4">
            {result.required === 0 ? (
              <EmptyState title="Aucune compétence reconnue" text="Ajoutez les technologies demandées dans l'annonce (langages, outils, méthodes), puis relancez." />
            ) : (
              <>
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="font-semibold">
                    {covered} compétence{covered > 1 ? "s" : ""} sur {items.length} déjà dans votre profil
                  </h2>
                  <Pill tone={percent >= 75 ? "good" : percent >= 50 ? "info" : "warn"}>{percent} %</Pill>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full rounded-full bg-forest transition-all duration-700" style={{ width: `${percent}%` }} />
                </div>

                {missing.length > 0 ? (
                  <div className="mt-5">
                    <h3 className="text-sm font-semibold">Il vous manque</h3>
                    <p className="mt-0.5 text-sm text-sage">Si vous maîtrisez déjà l&apos;une d&apos;elles, ajoutez-la à votre profil.</p>
                    <ul className="mt-3 space-y-2">
                      {missing.map((item) => (
                        <li key={item.skill} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2.5">
                          <span className="text-sm font-medium">{item.skill}</span>
                          <button
                            type="button"
                            disabled={adding !== ""}
                            onClick={() => void addSkill(item.skill)}
                            className="shrink-0 rounded-full border border-forest px-3 py-1 text-xs font-semibold text-forest transition hover:bg-tint active:scale-95 disabled:opacity-50"
                          >
                            {adding === item.skill ? "Ajout…" : "Je la maîtrise"}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-good">Votre profil couvre toutes les compétences de cette offre.</p>
                )}

                {have.length > 0 ? (
                  <div className="mt-5">
                    <h3 className="text-sm font-semibold">Déjà dans votre profil</h3>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {have.map((item) => (
                        <Pill key={item.skill} tone="good">
                          ✓ {item.skill}
                        </Pill>
                      ))}
                    </div>
                  </div>
                ) : null}

                {added.length > 0 ? (
                  <p className="mt-4 text-sm text-sage">
                    {added.length > 1 ? "Ces compétences sont ajoutées" : "Cette compétence est ajoutée"} à votre profil.{" "}
                    <Link href="/candidat/cv-builder?step=competences" className="font-semibold text-forest hover:underline">
                      Les mettre en valeur dans votre CV
                    </Link>
                  </p>
                ) : null}
              </>
            )}
          </Card>
        ) : null}

        <section className="mt-8">
          <h2 className="text-lg font-semibold">Face au marché</h2>
          <p className="mt-1 text-sm text-sage">Les écarts les plus importants d&apos;abord.</p>
          <div className="mt-3 space-y-3">
            {gaps === null ? (
              <>
                <Skeleton className="h-24" />
                <Skeleton className="h-24" />
              </>
            ) : null}
            {gaps && gaps.length === 0 ? (
              <EmptyState title="Aucun écart calculé" text="Ajoutez des compétences à votre profil ou déposez votre CV : nous les comparerons aux attentes du marché." href="/candidat/cv-builder?step=competences" cta="Compléter mes compétences" />
            ) : null}
            {ranked.map((gap) => {
              const delta = gap.marketLevel - gap.currentLevel;
              return (
                <Card key={gap.id} className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold">{gap.skill}</p>
                    <Pill tone={delta <= 0 ? "good" : delta < 25 ? "info" : "warn"}>{delta <= 0 ? "Au niveau du marché" : `${delta} points d'écart`}</Pill>
                  </div>
                  <div className="relative mt-3 h-2 overflow-hidden rounded-full bg-paper" aria-hidden>
                    <div className="absolute h-full rounded-full bg-line" style={{ width: `${gap.marketLevel}%` }} />
                    <div className="absolute h-full rounded-full bg-forest" style={{ width: `${gap.currentLevel}%` }} />
                  </div>
                  <p className="mt-1.5 text-xs text-sage">
                    Vous : {gap.currentLevel} % · marché : {gap.marketLevel} %
                  </p>
                  {gap.recommendedTraining ? <p className="mt-2 text-sm leading-6">{gap.recommendedTraining}</p> : null}
                </Card>
              );
            })}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
