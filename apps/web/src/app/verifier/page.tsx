"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { api } from "@/lib/api";
import { homeFor, type AuthUser } from "@/lib/auth";

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen p-10 text-sm">Confirmation…</div>}>
      <Verify />
    </Suspense>
  );
}

function Verify() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      setError("Lien incomplet.");
      return;
    }
    api<{ token: string; user: AuthUser }>("/auth/verify-email", { body: { token } })
      .then((result) => {
        localStorage.setItem("nextgen_token", result.token);
        window.location.href = homeFor(result.user.role);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Confirmation impossible.");
      });
  }, [token]);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-md px-5 py-16">
        <h1 className="serif text-4xl">Confirmation</h1>
        <p className="mt-4 text-sm text-forest/70">{error || "Validation de l'adresse…"}</p>
        {error ? (
          <Link href="/login" className="mt-6 inline-block text-sm text-copper">
            Retour à la connexion
          </Link>
        ) : null}
      </main>
    </div>
  );
}
