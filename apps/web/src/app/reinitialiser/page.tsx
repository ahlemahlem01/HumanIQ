"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { api } from "@/lib/api";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen p-10 text-sm">Chargement…</div>}>
      <ResetForm />
    </Suspense>
  );
}

function ResetForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const password = String(new FormData(event.currentTarget).get("password"));
    const confirm = String(new FormData(event.currentTarget).get("confirm"));
    if (password !== confirm) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setPending(true);
    try {
      await api("/auth/reset-password", { body: { token, password } });
      router.push("/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Réinitialisation impossible.");
      setPending(false);
    }
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-md px-5 py-16">
        <h1 className="serif text-4xl">Nouveau mot de passe</h1>
        <p className="mt-2 text-sm text-forest/70">8 caractères minimum.</p>
        {token ? (
          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <label className="block text-sm">
              <span className="mb-1 block text-forest/70">Nouveau mot de passe</span>
              <input
                required
                minLength={8}
                name="password"
                type="password"
                className="w-full rounded-xl border border-line bg-cream px-3 py-2 outline-none ring-copper focus:ring-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-forest/70">Confirmation</span>
              <input
                required
                minLength={8}
                name="confirm"
                type="password"
                className="w-full rounded-xl border border-line bg-cream px-3 py-2 outline-none ring-copper focus:ring-2"
              />
            </label>
            {error ? <p className="text-sm text-copper">{error}</p> : null}
            <button
              disabled={pending}
              className="w-full rounded-full bg-forest py-3 text-cream disabled:opacity-60"
            >
              {pending ? "Enregistrement…" : "Enregistrer"}
            </button>
          </form>
        ) : (
          <p className="mt-8 text-sm text-copper">Lien incomplet. Redemandez une réinitialisation.</p>
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
