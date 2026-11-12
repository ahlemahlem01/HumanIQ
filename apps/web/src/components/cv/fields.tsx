"use client";

import { useId, useState, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";

export const inputClass =
  "w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm outline-none transition placeholder:text-sage/70 focus:border-forest focus:ring-4 focus:ring-forest/10 disabled:bg-paper disabled:text-sage";

export function Field({
  label,
  hint,
  className = "",
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
      </label>
      {children(id)}
      {hint ? <p className="mt-1 text-xs text-sage">{hint}</p> : null}
    </div>
  );
}

export function TextField({
  label,
  hint,
  className,
  ...props
}: { label: string; hint?: string; className?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Field label={label} hint={hint} className={className}>
      {(id) => <input id={id} {...props} className={inputClass} />}
    </Field>
  );
}

export function AreaField({
  label,
  hint,
  className,
  ...props
}: { label: string; hint?: string; className?: string } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Field label={label} hint={hint} className={className}>
      {(id) => <textarea id={id} {...props} className={`${inputClass} resize-y leading-6`} />}
    </Field>
  );
}

export function StepHeader({ title, intro }: { title: string; intro: string }) {
  return (
    <header className="mb-6">
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-1.5 max-w-xl text-[15px] leading-6 text-sage">{intro}</p>
    </header>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-line bg-white p-5 ${className}`}>{children}</div>;
}

/** Two-click delete: the first click arms the button, so one slip never loses an entry. */
export function RemoveButton({ onConfirm, label = "Supprimer" }: { onConfirm: () => void; label?: string }) {
  const [armed, setArmed] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        if (armed) onConfirm();
        else setArmed(true);
      }}
      onBlur={() => setArmed(false)}
      className={`rounded-full px-3 py-1 text-xs font-semibold transition active:scale-95 ${
        armed ? "bg-red-700 text-white" : "text-red-700 hover:bg-red-50"
      }`}
    >
      {armed ? "Confirmer" : label}
    </button>
  );
}

export function Chip({
  children,
  active,
  onClick,
  tone = "neutral",
}: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  tone?: "neutral" | "good" | "warn";
}) {
  const palette =
    tone === "warn"
      ? "border-amber-200 bg-amber-50 text-warn hover:border-warn"
      : tone === "good"
        ? "border-emerald-200 bg-emerald-50 text-good"
        : active
          ? "border-forest bg-forest text-white"
          : "border-line bg-white text-ink hover:border-forest";
  const Tag = onClick ? "button" : "span";
  return (
    <Tag
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition ${palette} ${onClick ? "active:scale-95" : ""}`}
    >
      {children}
    </Tag>
  );
}

export function SaveHint({ complete, what }: { complete: boolean; what: string }) {
  return complete ? (
    <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-good">Enregistré</span>
  ) : (
    <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-warn" title={`Renseignez ${what} pour enregistrer`}>
      À compléter
    </span>
  );
}
