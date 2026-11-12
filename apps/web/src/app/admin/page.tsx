"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Overview = {
  users: number;
  jobs: number;
  applications: number;
  companies: { id: string; name: string; plan: string; subscriptionStatus: string; seats: number }[];
  byRole: { role: string; _count: number }[];
};

type Coverage = {
  provider: string;
  model: string;
  dimensions: number;
  entities: { entity: string; total: number; embedded: number; currentModel: number }[];
};

export default function AdminHome() {
  const { token } = useAuth();
  const [data, setData] = useState<Overview | null>(null);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [reindexNote, setReindexNote] = useState("");

  useEffect(() => {
    if (!token) return;
    api<Overview>("/admin/overview", { token }).then(setData);
    api<Coverage>("/ai/embeddings/coverage", { token }).then(setCoverage).catch(() => setCoverage(null));
  }, [token]);

  async function reindex() {
    if (!token) return;
    setReindexNote("Indexation en cours…");
    try {
      const result = await api<{ jobsIndexed: number; candidatesIndexed: number; model: string }>(
        "/ai/embeddings/reindex",
        { token },
      );
      setReindexNote(
        `${result.jobsIndexed} offres et ${result.candidatesIndexed} profils réindexés (${result.model}).`,
      );
      setCoverage(await api<Coverage>("/ai/embeddings/coverage", { token }));
    } catch (err) {
      setReindexNote(err instanceof Error ? err.message : "Réindexation impossible.");
    }
  }

  return (
    <AppShell role="ADMIN" title="Pilotage de la plateforme">
      <div className="grid gap-4 md:grid-cols-3">
        <Stat label="Utilisateurs" value={data?.users} />
        <Stat label="Offres" value={data?.jobs} />
        <Stat label="Candidatures" value={data?.applications} />
      </div>
      <h2 className="serif mt-10 text-2xl">Couche vectorielle</h2>
      <p className="mt-1 text-sm text-forest/60">
        {coverage
          ? `${coverage.provider} · ${coverage.model} · ${coverage.dimensions} dimensions`
          : "Couverture indisponible."}
      </p>
      <ul className="mt-4 space-y-2">
        {coverage?.entities.map((entity) => (
          <li key={entity.entity} className="flex justify-between rounded-xl border border-line bg-cream px-4 py-3 text-sm">
            <span>{entity.entity}</span>
            <span>
              {entity.embedded}/{entity.total} vectorisés
            </span>
          </li>
        ))}
      </ul>
      <button onClick={reindex} className="mt-4 rounded-full bg-forest px-4 py-2 text-sm text-cream">
        Réindexer les embeddings
      </button>
      {reindexNote ? <p className="mt-2 text-sm text-copper">{reindexNote}</p> : null}

      <h2 className="serif mt-10 text-2xl">Abonnements B2B</h2>
      <ul className="mt-4 space-y-2">
        {data?.companies.map((c) => (
          <li key={c.id} className="flex justify-between rounded-xl border border-line bg-cream px-4 py-3 text-sm">
            <span>{c.name}</span>
            <span>
              {c.plan} · {c.subscriptionStatus} · {c.seats} sièges
            </span>
          </li>
        ))}
      </ul>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value?: number }) {
  return (
    <div className="rounded-2xl border border-line bg-cream p-5">
      <p className="text-xs uppercase tracking-widest text-forest/50">{label}</p>
      <p className="serif mt-2 text-4xl">{value ?? "—"}</p>
    </div>
  );
}
