"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { AuthLayout, TextField } from "@/components/auth-layout";
import { homeFor, useAuth, type Role } from "@/lib/auth";

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [role, setRole] = useState<Role>("CANDIDATE");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState<{ email: string; delivered: boolean; verifyPath?: string } | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    const form = new FormData(event.currentTarget);
    try {
      const result = await register({
        email: form.get("email"),
        password: form.get("password"),
        firstName: form.get("firstName"),
        lastName: form.get("lastName"),
        role,
        companyName: form.get("companyName") || undefined,
        gdprConsent: form.get("gdpr") === "on",
      });
      if ("verificationRequired" in result) {
        setSent(result);
        return;
      }
      router.push(homeFor(result.role));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Inscription impossible.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthLayout title="Créer un compte" subtitle="Gratuit, en moins d'une minute.">
      {sent ? (
        <div className="space-y-3 rounded-3xl bg-paper p-5 text-sm">
          <p>Un e-mail de confirmation part vers {sent.email}. Ouvrez-le pour activer la connexion.</p>
          {sent.delivered ? null : (
            <p className="text-warn">L&apos;envoi a échoué. Le lien direct reste utilisable.</p>
          )}
          {sent.verifyPath ? (
            <Link href={sent.verifyPath} className="inline-block rounded-full bg-forest px-5 py-2.5 font-semibold text-white">
              Confirmer mon adresse
            </Link>
          ) : null}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 rounded-full bg-paper p-1">
            {(
              [
                ["CANDIDATE", "Je cherche un poste"],
                ["RECRUITER", "Je recrute"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setRole(value)}
                className={`rounded-full px-4 py-2.5 text-sm font-semibold transition ${
                  role === value ? "bg-white text-forest shadow-sm" : "text-sage hover:text-ink"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <TextField name="firstName" label="Prénom" />
              <TextField name="lastName" label="Nom" />
            </div>
            <TextField name="email" label="E-mail" type="email" />
            <TextField name="password" label="Mot de passe (8 caractères min.)" type="password" />
            {role === "RECRUITER" ? <TextField name="companyName" label="Entreprise" /> : null}
            <label className="flex items-start gap-2 text-sm text-sage">
              <input name="gdpr" type="checkbox" required className="mt-1 h-4 w-4 accent-[#1a3585]" />
              J&apos;accepte le traitement de mes données personnelles (RGPD / INPDP) pour le recrutement.
            </label>
            {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
            <button
              disabled={pending}
              className="w-full rounded-full bg-forest py-3.5 text-sm font-semibold text-white transition disabled:opacity-60"
            >
              {pending ? "Création…" : "Rejoindre HumanIQ"}
            </button>
          </form>
        </>
      )}
      <p className="mt-6 text-center text-sm text-sage">
        Déjà inscrit ?{" "}
        <Link href="/login" className="font-semibold text-forest hover:underline">
          Connexion
        </Link>
      </p>
    </AuthLayout>
  );
}
