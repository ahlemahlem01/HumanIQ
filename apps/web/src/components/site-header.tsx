"use client";

import Link from "next/link";
import { Logo } from "@/components/logo";
import { homeFor, useAuth } from "@/lib/auth";

export function SiteHeader() {
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-5 py-3">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2.5 text-xl font-bold text-forest transition active:scale-95">
            <Logo size={34} tile />
            HumanIQ
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-medium text-ink md:flex">
            <Link href="/offres" className="hover:text-forest">
              Trouver une offre
            </Link>
            <Link href="/register" className="hover:text-forest">
              Recruter
            </Link>
          </nav>
        </div>
        <nav className="flex items-center gap-3 text-sm">
          {user ? (
            <>
              <Link
                href={homeFor(user.role)}
                className="rounded-full bg-forest px-4 py-1.5 font-semibold text-white"
              >
                Mon espace
              </Link>
              <button type="button" onClick={logout} className="text-sage hover:text-ink">
                Déconnexion
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="font-medium text-ink hover:text-forest">
                Connexion
              </Link>
              <Link
                href="/register"
                className="rounded-full bg-forest px-4 py-1.5 font-semibold text-white"
              >
                Créer un compte
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
