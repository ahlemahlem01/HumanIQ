"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
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

export default function SalaryPage() {
  const { token } = useAuth();
  const [markets, setMarkets] = useState<Market[]>([]);
  const [selected, setSelected] = useState<Market | null>(null);
  const [askMin, setAskMin] = useState("");
  const [askMax, setAskMax] = useState("");
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!token) return;
    Promise.all([
      api<Market[]>("/ai/salary/markets", { token }),
      api<Profile>("/candidates/me", { token }),
    ])
      .then(([rows, profile]) => {
        setMarkets(rows);
        setAskMin(profile.salaryMin ? String(profile.salaryMin) : "");
        setAskMax(profile.salaryMax ? String(profile.salaryMax) : "");
        setSelected(closestMarket(rows, profile));
      })
      .catch(() => setError("Références indisponibles."));
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enregistrement impossible.");
    } finally {
      setPending(false);
    }
  }

  const min = Number(askMin) || null;
  const max = Number(askMax) || null;
  const sameCurrency = selected?.currency === "EUR";

  return (
    <AppShell role="CANDIDATE" plain>
      <div className="mx-auto max-w-2xl">
        <h1 className="text-lg font-semibold">Salaire</h1>
        <p className="mt-1 text-sm text-sage">
          Fourchette annuelle du marché, puis l&apos;endroit où se situe ce que vous demandez.
        </p>

        {markets.length ? (
          <div className="mt-5 flex flex-wrap gap-2">
            {markets.map((market) => {
              const active = selected?.role === market.role && selected.tech === market.tech && selected.location === market.location;
              return (
                <button
                  key={`${market.role}-${market.tech}-${market.location}`}
                  type="button"
                  onClick={() => {
                    setSelected(market);
                    setSaved("");
                  }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${active ? "bg-forest text-cream" : "border border-line bg-cream"}`}
                >
                  {marketLabel(market)}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="mt-5 text-sm text-sage">{error || "Aucune référence pour le moment."}</p>
        )}

        {selected ? (
          <section className="mt-5 rounded-xl border border-line bg-cream px-5 py-5">
            <p className="text-xs text-sage">{marketLabel(selected)}</p>
            <p className="mt-1 text-3xl font-semibold">{quote(selected.p50, selected)}</p>
            <p className="mt-1 text-sm text-sage">
              {periodLabel(selected)} · de {quote(selected.p25, selected)} à {quote(selected.p75, selected)}
            </p>
            <RangeBar
              low={selected.p25}
              mid={selected.p50}
              high={selected.p75}
              askMin={sameCurrency ? min : null}
              askMax={sameCurrency ? max : null}
            />
            <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
              <Figure label="Bas" value={selected.p25} market={selected} />
              <Figure label="Médiane" value={selected.p50} market={selected} />
              <Figure label="Haut" value={selected.p75} market={selected} />
            </div>
            <p className="mt-4 text-sm">{compare(selected, min, max, "EUR")}</p>
          </section>
        ) : null}

        <section className="mt-4 rounded-xl border border-line bg-cream px-5 py-5">
          <h2 className="text-sm font-semibold">Votre demande</h2>
          <p className="mt-1 text-sm text-sage">Montants annuels bruts en euros, la monnaie de votre profil.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <label className="text-xs text-sage">
              Minimum
              <input
                type="number"
                min={0}
                value={askMin}
                onChange={(event) => setAskMin(event.target.value)}
                className="mt-1 w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm text-forest outline-none ring-forest focus:ring-2"
              />
            </label>
            <label className="text-xs text-sage">
              Maximum
              <input
                type="number"
                min={0}
                value={askMax}
                onChange={(event) => setAskMax(event.target.value)}
                className="mt-1 w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm text-forest outline-none ring-forest focus:ring-2"
              />
            </label>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={saveAsk}
            className="mt-3 rounded-lg bg-forest px-3 py-1.5 text-xs font-semibold text-cream disabled:opacity-60"
          >
            {pending ? "Enregistrement…" : "Enregistrer"}
          </button>
          {saved ? <p className="mt-2 text-sm text-[#145c40]">{saved}</p> : null}
          {error ? <p className="mt-2 text-sm text-warn">{error}</p> : null}
        </section>
      </div>
    </AppShell>
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

function compare(market: Market, askMin: number | null, askMax: number | null, askCurrency: string) {
  if (market.currency !== askCurrency) {
    const local = PLACE[market.location]?.money ?? market.currency;
    return `Cette référence est un salaire mensuel en ${local}. Votre demande annuelle en euros n'est pas placée sur cette échelle.`;
  }
  if (!askMin || !askMax) return "Indiquez votre demande pour la placer sur cette fourchette.";
  if (askMax < market.p25) return "Votre demande est sous le bas du marché.";
  if (askMin > market.p75) return "Votre demande est au-dessus du haut du marché.";
  if (askMin <= market.p50 && askMax >= market.p50) return "Votre demande couvre la médiane.";
  if (askMin >= market.p50) return "Vous visez le haut de la fourchette.";
  return "Vous visez le bas de la fourchette.";
}

function Figure({ label, value, market }: { label: string; value: number; market: Market }) {
  return (
    <div>
      <p className="text-xs text-sage">{label}</p>
      <p className="font-semibold">{quote(value, market)}</p>
    </div>
  );
}

function RangeBar({
  low,
  mid,
  high,
  askMin,
  askMax,
}: {
  low: number;
  mid: number;
  high: number;
  askMin: number | null;
  askMax: number | null;
}) {
  const start = Math.min(low, askMin ?? low);
  const end = Math.max(high, askMax ?? high);
  const span = Math.max(1, end - start);
  const pos = (value: number) => `${((value - start) / span) * 100}%`;
  const width = (from: number, to: number) => `${(Math.max(0, to - from) / span) * 100}%`;
  return (
    <div className="relative mt-6 h-2 rounded-full bg-paper">
      <span className="absolute h-full rounded-full bg-forest/25" style={{ left: pos(low), width: width(low, high) }} />
      {askMin && askMax ? (
        <span className="absolute h-full rounded-full bg-forest" style={{ left: pos(Math.min(askMin, askMax)), width: width(Math.min(askMin, askMax), Math.max(askMin, askMax)) }} />
      ) : null}
      <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-cream bg-forest" style={{ left: pos(mid) }} />
    </div>
  );
}
