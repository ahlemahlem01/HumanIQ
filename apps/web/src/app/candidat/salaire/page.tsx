"use client";

import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card, EmptyState, ghostButton, PageHeader, primaryButton, Skeleton } from "@/components/candidate-ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Market = {
  role: string;
  tech: string;
  location: string;
  p25: number;
  p50: number;
  p75: number;
  currency: string;
};

type Profile = {
  headline: string | null;
  location: string | null;
  skills: string[];
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string;
};

const ROLE_LABEL: Record<string, string> = {
  "Software Engineer": "Ingénieur logiciel",
  "Product Designer": "Product designer",
};

const PLACE: Record<string, { country: string; money: string }> = {
  Paris: { country: "France", money: "euros" },
  Tunis: { country: "Tunisie", money: "dinars tunisiens" },
};

type Verdict = { tone: "good" | "info" | "warn" | "neutral"; text: string };

const VERDICT_STYLE: Record<Verdict["tone"], string> = {
  good: "bg-emerald-50 text-good",
  info: "bg-tint text-forest",
  warn: "bg-amber-50 text-warn",
  neutral: "bg-paper text-sage",
};

export default function SalaryPage() {
  const { token } = useAuth();
  const [markets, setMarkets] = useState<Market[] | null>(null);
  const [selected, setSelected] = useState<Market | null>(null);
  const [askMin, setAskMin] = useState("");
  const [askMax, setAskMax] = useState("");
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!token) return;
    Promise.all([api<Market[]>("/ai/salary/markets", { token }), api<Profile>("/candidates/me", { token })])
      .then(([rows, profile]) => {
        setMarkets(rows);
        setAskMin(profile.salaryMin ? String(profile.salaryMin) : "");
        setAskMax(profile.salaryMax ? String(profile.salaryMax) : "");
        setSelected(closestMarket(rows, profile));
      })
      .catch(() => {
        setMarkets([]);
        setError("Références indisponibles.");
      });
    return () => clearTimeout(timer.current);
  }, [token]);

  async function saveAsk() {
    if (!token) return;
    const salaryMin = Number(askMin);
    const salaryMax = Number(askMax);
    if (!salaryMin || !salaryMax || salaryMax < salaryMin) {
      setError("Indiquez un minimum et un maximum, le maximum au-dessus du minimum.");
      setSaved("");
      return;
    }
    setPending(true);
    setError("");
    try {
      await api("/candidates/me", { method: "PATCH", token, body: { salaryMin, salaryMax } });
      setSaved("Demande enregistrée sur votre profil.");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setSaved(""), 3500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enregistrement impossible.");
    } finally {
      setPending(false);
    }
  }

  const min = Number(askMin) || null;
  const max = Number(askMax) || null;
  const comparable = selected?.currency === "EUR";
  const marketKey = (market: Market) => `${market.role}|${market.tech}|${market.location}`;

  return (
    <AppShell role="CANDIDATE" plain>
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Salaire" intro="La fourchette du marché pour votre profil, puis l'endroit où se situe ce que vous demandez." />

        {markets === null ? (
          <div className="space-y-4">
            <Skeleton className="h-12" />
            <Skeleton className="h-56" />
          </div>
        ) : null}

        {markets && markets.length === 0 ? <EmptyState title="Aucune référence pour le moment" text={error || "Les références de salaire seront affichées ici dès qu'elles seront disponibles."} /> : null}

        {markets && markets.length > 0 ? (
          <>
            <label htmlFor="market" className="mb-1.5 block text-sm font-semibold">
              Marché de référence
            </label>
            <select
              id="market"
              value={selected ? marketKey(selected) : ""}
              onChange={(event) => {
                setSelected(markets.find((market) => marketKey(market) === event.target.value) ?? null);
                setSaved("");
              }}
              className="w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-forest focus:ring-4 focus:ring-forest/10"
            >
              {markets.map((market) => (
                <option key={marketKey(market)} value={marketKey(market)}>
                  {marketLabel(market)}
                </option>
              ))}
            </select>

            {selected ? (
              <Card className="mt-4">
                <p className="text-xs text-sage">{periodLabel(selected)}</p>
                <p className="mt-1 text-4xl font-bold tracking-tight">{quote(selected.p50, selected)}</p>
                <p className="mt-1 text-sm text-sage">
                  médiane · de {quote(selected.p25, selected)} à {quote(selected.p75, selected)}
                </p>

                <RangeBar market={selected} askMin={comparable ? min : null} askMax={comparable ? max : null} />

                <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-sage" aria-label="Légende">
                  <li className="flex items-center gap-1.5">
                    <span className="h-2 w-5 rounded-full bg-forest/25" /> Fourchette du marché
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-full border-2 border-white bg-forest ring-1 ring-forest" /> Médiane
                  </li>
                  {comparable ? (
                    <li className="flex items-center gap-1.5">
                      <span className="h-2 w-5 rounded-full bg-forest" /> Votre demande
                    </li>
                  ) : null}
                </ul>

                {(() => {
                  const verdict = compare(selected, min, max, "EUR");
                  return <p className={`mt-4 rounded-xl px-4 py-3 text-sm leading-6 ${VERDICT_STYLE[verdict.tone]}`}>{verdict.text}</p>;
                })()}
              </Card>
            ) : null}
          </>
        ) : null}

        <Card className="mt-4">
          <h2 className="font-semibold">Votre demande</h2>
          <p className="mt-0.5 text-sm text-sage">Montants annuels bruts en euros, la monnaie de votre profil. Les recruteurs la voient si votre profil est visible.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <MoneyField id="ask-min" label="Minimum" value={askMin} onChange={setAskMin} />
            <MoneyField id="ask-max" label="Maximum" value={askMax} onChange={setAskMax} />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" disabled={pending} onClick={() => void saveAsk()} className={primaryButton}>
              {pending ? "Enregistrement…" : "Enregistrer"}
            </button>
            {selected && comparable ? (
              <button
                type="button"
                onClick={() => {
                  setAskMin(String(selected.p25));
                  setAskMax(String(selected.p75));
                  setSaved("");
                  setError("");
                }}
                className={ghostButton}
              >
                Reprendre la fourchette du marché
              </button>
            ) : null}
          </div>
          <p role="status" aria-live="polite" className="mt-3 min-h-5 text-sm text-good">
            {saved}
          </p>
          {error && markets && markets.length > 0 ? (
            <p role="alert" className="mt-1 rounded-xl bg-amber-50 px-4 py-3 text-sm text-warn">
              {error}
            </p>
          ) : null}
        </Card>
      </div>
    </AppShell>
  );
}

function MoneyField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          step={1000}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-xl border border-line bg-white py-2.5 pl-3.5 pr-10 text-sm outline-none transition focus:border-forest focus:ring-4 focus:ring-forest/10"
        />
        <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-sage" aria-hidden>
          €
        </span>
      </div>
    </div>
  );
}

function closestMarket(markets: Market[], profile: Profile) {
  if (!markets.length) return null;
  const location = (profile.location ?? "").toLowerCase();
  const skills = profile.skills.map((skill) => skill.toLowerCase());
  return (
    markets.find((market) => location.includes(market.location.toLowerCase()) && skills.includes(market.tech.toLowerCase())) ??
    markets.find((market) => location.includes(market.location.toLowerCase())) ??
    markets[0]
  );
}

function marketLabel(market: Market) {
  const role = ROLE_LABEL[market.role] ?? market.role;
  const place = PLACE[market.location];
  const where = place ? `${market.location}, ${place.country}` : market.location;
  return `${role} · ${market.tech} · ${where}`;
}

function monthlyMarket(market: Market) {
  return market.currency === "TND";
}

function quote(annual: number, market: Market) {
  if (monthlyMarket(market)) {
    return `${Math.round(annual / 12).toLocaleString("fr-FR")} DT`;
  }
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: market.currency, maximumFractionDigits: 0 }).format(annual);
}

function periodLabel(market: Market) {
  if (monthlyMarket(market)) return "Salaire brut mensuel, pratique du marché tunisien";
  return `Médiane brute annuelle en ${PLACE[market.location]?.money ?? market.currency}`;
}

function compare(market: Market, askMin: number | null, askMax: number | null, askCurrency: string): Verdict {
  if (market.currency !== askCurrency) {
    const local = PLACE[market.location]?.money ?? market.currency;
    return { tone: "neutral", text: `Cette référence est un salaire mensuel en ${local}. Votre demande annuelle en euros n'est pas placée sur cette échelle.` };
  }
  if (!askMin || !askMax) return { tone: "neutral", text: "Indiquez votre demande pour la placer sur cette fourchette." };
  if (askMax < market.p25) return { tone: "warn", text: "Votre demande est sous le bas du marché : vous pourriez demander davantage." };
  if (askMin > market.p75) return { tone: "warn", text: "Votre demande est au-dessus du haut du marché : elle peut limiter vos opportunités." };
  if (askMin <= market.p50 && askMax >= market.p50) return { tone: "good", text: "Votre demande couvre la médiane du marché." };
  if (askMin >= market.p50) return { tone: "info", text: "Vous visez le haut de la fourchette." };
  return { tone: "info", text: "Vous visez le bas de la fourchette." };
}

function RangeBar({ market, askMin, askMax }: { market: Market; askMin: number | null; askMax: number | null }) {
  const low = market.p25;
  const mid = market.p50;
  const high = market.p75;
  const start = Math.min(low, askMin ?? low);
  const end = Math.max(high, askMax ?? high);
  const span = Math.max(1, end - start);
  const pct = (value: number) => ((value - start) / span) * 100;
  const hasAsk = Boolean(askMin && askMax);
  return (
    <div className="mt-8 px-10">
      <div className="relative h-2.5 rounded-full bg-paper" role="img" aria-label="Position de votre demande par rapport à la fourchette du marché">
        <span className="absolute h-full rounded-full bg-forest/25" style={{ left: `${pct(low)}%`, width: `${pct(high) - pct(low)}%` }} />
        {hasAsk ? (
          <span
            className="absolute h-full rounded-full bg-forest"
            style={{ left: `${pct(Math.min(askMin!, askMax!))}%`, width: `${pct(Math.max(askMin!, askMax!)) - pct(Math.min(askMin!, askMax!))}%` }}
          />
        ) : null}
        <span className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-forest shadow ring-1 ring-forest" style={{ left: `${pct(mid)}%` }} />
      </div>
      <div className="relative mt-2 h-5 text-xs text-sage">
        <span className="absolute -translate-x-1/2" style={{ left: `${pct(low)}%` }}>
          {quote(low, market)}
        </span>
        <span className="absolute -translate-x-1/2 font-semibold text-ink" style={{ left: `${pct(mid)}%` }}>
          {quote(mid, market)}
        </span>
        <span className="absolute -translate-x-1/2" style={{ left: `${pct(high)}%` }}>
          {quote(high, market)}
        </span>
      </div>
    </div>
  );
}
