"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { api } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{
    message: string;
    delivered?: boolean;
    resetPath?: string;
  } | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    const email = String(new FormData(event.currentTarget).get("email"));
    try {
      setResult(await api("/auth/forgot-password", { body: { email } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Demande impossible.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-md px-5 py-16">
        <h1 className="serif text-4xl">Mot de passe oublié</h1>
        <p className="mt-2 text-sm text-forest/70">
          Indiquez l&apos;e-mail du compte. Le message part vers cette adresse et reste valable 30 minutes.
        </p>
        {result ? (
          <div className="mt-8 space-y-4 rounded-2xl border border-line bg-cream p-5 text-sm">
            <p>{result.message}</p>
            {result.delivered ? (
              <p className="text-forest/70">Regardez la boîte de réception et les courriers indésirables.</p>
            ) : null}
            {result.resetPath ? (
              <Link href={result.resetPath} className="inline-block rounded-full bg-forest px-4 py-2 text-cream">
                Choisir un nouveau mot de passe
              </Link>
            ) : null}
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <label className="block text-sm">
              <span className="mb-1 block text-forest/70">E-mail</span>
              <input
                required
                name="email"
                type="email"
                className="w-full rounded-xl border border-line bg-cream px-3 py-2 outline-none ring-copper focus:ring-2"
              />
            </label>
            {error ? <p className="text-sm text-copper">{error}</p> : null}
            <button
              disabled={pending}
              className="w-full rounded-full bg-forest py-3 text-cream disabled:opacity-60"
            >
              {pending ? "Envoi…" : "Envoyer l'e-mail"}
            </button>
          </form>
        )}
        <p className="mt-6 text-sm">
          <Link href="/login" className="text-copper">
            Retour à la connexion
          </Link>
        </p>
      </main>
    </div>
  );
}
