"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export type MatchData = {
  score: number;
  semanticScore: number | null;
  keywordScore: number;
  matchedKeywords: string[];
  missingKeywords: string[];
  similarity?: number | null;
  method?: string;
  model?: string | null;
};

type Tier = { label: string; color: string; text: string };

function tierOf(score: number): Tier {
  if (score >= 75) return { label: "Excellent match", color: "#0f6e56", text: "text-good" };
  if (score >= 55) return { label: "Bon match", color: "#1a3585", text: "text-forest" };
  if (score >= 35) return { label: "Match partiel", color: "#b45309", text: "text-warn" };
  return { label: "Match faible", color: "#b91c1c", text: "text-red-700" };
}

/** Eases a number from 0 to `target` so rings and bars animate on first paint. */
function useAnimated(target: number, duration = 900) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);
  return value;
}

export function MatchRing({ value, size = 140 }: { value: number; size?: number }) {
  const tier = tierOf(value);
  const animated = useAnimated(value);
  const stroke = Math.round(size * 0.09);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - animated / 100);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`Compatibilité ${value} %`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e5eaf3" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={tier.color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`font-bold leading-none ${tier.text}`} style={{ fontSize: size * 0.28 }}>
          {animated}
          <span style={{ fontSize: size * 0.14 }}>%</span>
        </span>
        <span className="mt-1 text-[11px] font-medium text-sage">compatibilité</span>
      </div>
    </div>
  );
}

function Bar({ label, value, hint }: { label: string; value: number | null; hint?: string }) {
  const animated = useAnimated(value ?? 0);
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="font-semibold">
          {value === null ? "—" : `${animated}%`}
          {hint ? <span className="ml-2 text-xs font-normal text-sage">{hint}</span> : null}
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-forest" style={{ width: `${value === null ? 0 : animated}%` }} />
      </div>
    </div>
  );
}

function reasons(match: MatchData) {
  const matched = match.matchedKeywords.length;
  const total = matched + match.missingKeywords.length;
  const list: { ok: boolean; text: string }[] = [];

  if (total > 0) {
    list.push({
      ok: matched / total >= 0.6,
      text: `Vous couvrez ${matched} des ${total} compétences demandées.`,
    });
  }
  if (match.semanticScore === null || match.method === "keyword-only") {
    list.push({
      ok: false,
      text: "Aucun CV analysé : téléversez-en un pour activer le matching sémantique.",
    });
  } else {
    list.push({
      ok: match.semanticScore >= 55,
      text:
        match.semanticScore >= 55
          ? `Le contenu de votre CV est proche du sens de l'offre (${match.semanticScore} %).`
          : `Le contenu de votre CV s'éloigne du sens de l'offre (${match.semanticScore} %).`,
    });
  }
  if (match.missingKeywords.length > 0) {
    list.push({
      ok: false,
      text: `Ajouter « ${match.missingKeywords.slice(0, 3).join(" », « ")} » à votre profil améliorerait ce score.`,
    });
  }
  return list;
}

export function MatchInsight({ match }: { match: MatchData }) {
  const tier = tierOf(match.score);
  const list = reasons(match);

  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <div className="flex items-center gap-5">
        <MatchRing value={match.score} />
        <div className="min-w-0">
          <p className={`text-lg font-semibold ${tier.text}`}>{tier.label}</p>
          <p className="mt-1 text-sm leading-6 text-sage">
            Estimation IA basée sur le sens de votre CV et sur vos compétences.
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        <Bar
          label="Sémantique"
          value={match.semanticScore}
          hint={match.similarity != null ? `cosinus ${match.similarity.toFixed(2)}` : undefined}
        />
        <Bar label="Compétences (mots-clés)" value={match.keywordScore} />
      </div>

      <h3 className="mt-6 text-sm font-semibold">Pourquoi ce score</h3>
      <ul className="mt-2 space-y-2">
        {list.map((item) => (
          <li key={item.text} className="flex gap-2 text-sm leading-6">
            <span
              className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                item.ok ? "bg-emerald-100 text-good" : "bg-amber-100 text-warn"
              }`}
              aria-hidden
            >
              {item.ok ? "✓" : "!"}
            </span>
            {item.text}
          </li>
        ))}
      </ul>

      {match.matchedKeywords.length > 0 ? (
        <>
          <h3 className="mt-5 text-sm font-semibold">Compétences que vous avez</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {match.matchedKeywords.map((skill) => (
              <span key={skill} className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-good">
                ✓ {skill}
              </span>
            ))}
          </div>
        </>
      ) : null}

      {match.missingKeywords.length > 0 ? (
        <>
          <h3 className="mt-5 text-sm font-semibold">Compétences à ajouter</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {match.missingKeywords.map((skill) => (
              <span key={skill} className="rounded-full border border-dashed border-warn/60 bg-amber-50 px-3 py-1 text-xs font-semibold text-warn">
                + {skill}
              </span>
            ))}
          </div>
          <Link href="/candidat/profil" className="mt-4 inline-block text-sm font-semibold text-forest hover:underline">
            Compléter mon profil
          </Link>
        </>
      ) : null}
    </section>
  );
}
