"use client";

import Link from "next/link";
import type { ReactNode } from "react";

/** Small building blocks shared by the candidate pages, so they look and behave alike. */

export function PageHeader({ title, intro, action }: { title: string; intro?: string; action?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {intro ? <p className="mt-1.5 max-w-xl text-[15px] leading-6 text-sage">{intro}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-line bg-white p-5 ${className}`}>{children}</section>;
}

type Tone = "good" | "warn" | "bad" | "info" | "neutral";

const TONES: Record<Tone, string> = {
  good: "bg-emerald-50 text-good",
  warn: "bg-amber-50 text-warn",
  bad: "bg-red-50 text-red-700",
  info: "bg-tint text-forest",
  neutral: "bg-paper text-sage",
};

export function Pill({ tone = "neutral", children, className = "" }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONES[tone]} ${className}`}>{children}</span>;
}

/** Tone for a 0-100 score. */
export function scoreTone(score: number): Tone {
  return score >= 75 ? "good" : score >= 50 ? "info" : "warn";
}

export function ScoreRing({ value, size = 88, label }: { value: number; size?: number; label?: string }) {
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));
  const color = clamped >= 75 ? "text-good" : clamped >= 50 ? "text-forest" : "text-warn";
  return (
    <div className={`relative shrink-0 ${color}`} style={{ width: size, height: size }} role="img" aria-label={label ?? `Score ${clamped} sur 100`}>
      <svg viewBox="0 0 100 100" className="-rotate-90">
        <circle cx="50" cy="50" r={radius} fill="none" strokeWidth="9" className="stroke-line" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          strokeWidth="9"
          strokeLinecap="round"
          stroke="currentColor"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
          style={{ transition: "stroke-dashoffset 700ms cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-bold text-ink" style={{ fontSize: size * 0.3 }}>
        {clamped}
      </span>
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  busy = false,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description?: string;
  busy?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold">{label}</p>
        {description ? <p className="mt-0.5 text-sm leading-5 text-sage">{description}</p> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={busy}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest disabled:opacity-60 ${
          checked ? "bg-forest" : "bg-line"
        }`}
      >
        <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : ""}`} />
      </button>
    </div>
  );
}

export function EmptyState({ title, text, href, cta }: { title: string; text: string; href?: string; cta?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-paper/60 px-5 py-8 text-center">
      <p className="font-semibold">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-sage">{text}</p>
      {href && cta ? (
        <Link href={href} className="mt-4 inline-block rounded-full bg-forest px-5 py-2 text-sm font-semibold text-white transition active:scale-95">
          {cta}
        </Link>
      ) : null}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-paper ${className}`} aria-hidden />;
}

export const primaryButton =
  "inline-flex items-center justify-center rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-50";
export const ghostButton =
  "inline-flex items-center justify-center rounded-full border border-forest px-4 py-2 text-sm font-semibold text-forest transition hover:bg-tint active:scale-95 disabled:opacity-50";
