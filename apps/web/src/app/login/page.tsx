"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { AuthLayout, TextField } from "@/components/auth-layout";
import { homeFor, useAuth } from "@/lib/auth";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    const form = new FormData(event.currentTarget);
    try {
      const user = await login(String(form.get("email")), String(form.get("password")));
      router.push(homeFor(user.role));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connexion impossible.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthLayout title="Bon retour" subtitle="Connectez-vous pour accéder à votre espace.">
      <form onSubmit={onSubmit} className="space-y-4">
        <TextField name="email" label="E-mail" type="email" />
        <TextField name="password" label="Mot de passe" type="password" />
        <p className="text-right text-sm">
          <Link href="/mot-de-passe-oublie" className="font-medium text-forest hover:underline">
            Mot de passe oublié ?
          </Link>
        </p>
        {error ? (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        ) : null}
        <button
          disabled={pending}
          className="w-full rounded-full bg-forest py-3.5 text-sm font-semibold text-white transition disabled:opacity-60"
        >
          {pending ? "Connexion…" : "Se connecter"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-sage">
        Pas encore de compte ?{" "}
        <Link href="/register" className="font-semibold text-forest hover:underline">
          Créer un compte
        </Link>
      </p>
      <p className="mt-8 rounded-xl bg-paper px-4 py-3 text-xs leading-5 text-sage">
        Comptes de démonstration : candidat@mail.com, recruteur@atlas.tech, admin@nextgen.hr. Mot de
        passe : <code className="font-semibold text-ink">Demo1234!</code>
      </p>
    </AuthLayout>
  );
}
