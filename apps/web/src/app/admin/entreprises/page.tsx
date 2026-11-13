"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { CompanyLogo } from "@/components/company-logo";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Company = {
  id: string;
  name: string;
  website: string | null;
  logoUrl: string | null;
  domain: string | null;
  domainVerifiedAt: string | null;
  description: string | null;
  createdAt: string;
  verifiedAt: string | null;
  jobs: number;
  members: { name: string; email: string }[];
};

export default function CompaniesPage() {
  const { token } = useAuth();
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [error, setError] = useState("");

  async function load() {
    if (!token) return;
    setCompanies(await api<Company[]>("/admin/companies", { token }));
  }

  useEffect(() => {
    load().catch(() => setError("Chargement impossible."));
  }, [token]);

  async function setVerified(id: string, verified: boolean) {
    if (!token) return;
    setError("");
    try {
      await api(`/admin/companies/${id}/verify`, { method: "PATCH", token, body: { verified } });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action impossible.");
    }
  }

  const pending = (companies ?? []).filter((company) => !company.verifiedAt).length;

  return (
    <AppShell role="ADMIN" title="Entreprises">
      <p className="mb-4 text-sm text-sage">
        Un recruteur n&apos;accède aux CV, au vivier et aux messages des candidats qu&apos;après validation de son entreprise.
        {companies ? ` ${pending} en attente.` : ""}
      </p>
      {error ? <p className="mb-3 text-sm text-red-700">{error}</p> : null}
      <ul className="space-y-3">
        {(companies ?? []).map((company) => (
          <li key={company.id} className="rounded-2xl border border-line bg-cream px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <CompanyLogo company={company} className="h-12 w-12 rounded-lg text-sm" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {company.name}
                  <span
                    className={`ml-3 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      company.verifiedAt ? "bg-emerald-50 text-good" : "bg-amber-50 text-warn"
                    }`}
                  >
                    {company.verifiedAt ? "Vérifiée" : "En attente"}
                  </span>
                </p>
                <p className="mt-1 text-xs text-sage">
                  Inscrite le {new Date(company.createdAt).toLocaleDateString("fr-FR")} · {company.jobs} offre{company.jobs > 1 ? "s" : ""}
                  {company.website ? ` · ${company.website}` : ""}
                  {company.domain ? ` · domaine ${company.domain}${company.domainVerifiedAt ? " ✓ prouvé (DNS)" : " non prouvé"}` : ""}
                </p>
                {company.description ? <p className="mt-2 line-clamp-2 text-sm text-sage">{company.description}</p> : null}
                <ul className="mt-2 space-y-0.5 text-sm">
                  {company.members.map((member) => (
                    <li key={member.email}>
                      {member.name} <span className="text-sage">· {member.email}</span>
                    </li>
                  ))}
                </ul>
              </div>
              {company.verifiedAt ? (
                <button
                  type="button"
                  onClick={() => void setVerified(company.id, false)}
                  className="rounded-full border border-line px-4 py-1.5 text-sm font-semibold text-sage hover:border-red-300 hover:text-red-700"
                >
                  Retirer la validation
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void setVerified(company.id, true)}
                  className="rounded-full bg-forest px-5 py-1.5 text-sm font-semibold text-white hover:bg-forest-dark"
                >
                  Valider l&apos;entreprise
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
