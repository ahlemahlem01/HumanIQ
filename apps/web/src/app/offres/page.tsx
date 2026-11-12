"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { api } from "@/lib/api";

type Job = {
  id: string;
  title: string;
  location: string;
  remote: boolean;
  contractType: string;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string;
  requiredSkills: string[];
  company: { name: string };
};

function salary(job: Job) {
  if (!job.salaryMin) return null;
  const max = job.salaryMax ?? job.salaryMin;
  return job.currency === "TND"
    ? `${Math.round(job.salaryMin / 12).toLocaleString("fr-FR")}–${Math.round(max / 12).toLocaleString("fr-FR")} DT / mois`
    : `${job.salaryMin.toLocaleString("fr-FR")}–${max.toLocaleString("fr-FR")} € / an`;
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [q, setQ] = useState("");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [contract, setContract] = useState("");

  async function load(query = "") {
    const params = query ? `?q=${encodeURIComponent(query)}` : "";
    try {
      setJobs(await api<Job[]>(`/jobs${params}`));
    } catch {
      setJobs([]);
    }
    setLoaded(true);
  }

  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get("q") ?? "";
    setQ(initial);
    load(initial);
  }, []);

  function onSearch(event: FormEvent) {
    event.preventDefault();
    load(q);
  }

  const contracts = useMemo(() => Array.from(new Set(jobs.map((job) => job.contractType))), [jobs]);
  const visible = jobs.filter(
    (job) => (!remoteOnly || job.remote) && (!contract || job.contractType === contract),
  );

  return (
    <div className="min-h-screen bg-paper">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 py-8">
        <form onSubmit={onSearch} className="flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Poste, compétence ou ville"
            className="min-w-0 flex-1 rounded-full border border-line bg-white px-5 py-2.5 text-sm outline-none focus:border-forest focus:ring-2 focus:ring-forest/20"
          />
          <button className="rounded-full bg-forest px-6 py-2.5 text-sm font-semibold text-white">Rechercher</button>
        </form>

        <div className="mt-6 grid items-start gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="rounded-2xl border border-line bg-white p-4 text-sm">
            <h2 className="text-sm font-semibold">Filtres</h2>
            <label className="mt-4 flex items-center gap-2">
              <input
                type="checkbox"
                checked={remoteOnly}
                onChange={(e) => setRemoteOnly(e.target.checked)}
                className="h-4 w-4 accent-[#1a3585]"
              />
              Télétravail uniquement
            </label>
            <p className="mt-5 text-xs font-semibold uppercase tracking-widest text-sage">Contrat</p>
            <div className="mt-2 space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="contract"
                  checked={contract === ""}
                  onChange={() => setContract("")}
                  className="accent-[#1a3585]"
                />
                Tous
              </label>
              {contracts.map((type) => (
                <label key={type} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="contract"
                    checked={contract === type}
                    onChange={() => setContract(type)}
                    className="accent-[#1a3585]"
                  />
                  {type}
                </label>
              ))}
            </div>
          </aside>

          <section>
            <p className="text-sm text-sage">
              {loaded ? `${visible.length} offre${visible.length > 1 ? "s" : ""}` : "Chargement…"}
            </p>
            <ul className="mt-3 overflow-hidden rounded-xl border border-line bg-white">
              {visible.map((job) => (
                <li key={job.id} className="border-b border-line last:border-b-0">
                  <Link href={`/offres/${job.id}`} className="block p-5 hover:bg-paper">
                    <p className="text-xs text-sage">{job.company.name}</p>
                    <h2 className="mt-1 text-lg font-semibold text-forest">{job.title}</h2>
                    <p className="mt-1 text-sm text-sage">
                      {[job.contractType, salary(job), `${job.location}${job.remote ? " · Télétravail" : ""}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {job.requiredSkills.map((skill) => (
                        <span key={skill} className="rounded-full bg-tint px-3 py-1 text-xs font-medium text-forest">
                          {skill}
                        </span>
                      ))}
                    </div>
                  </Link>
                </li>
              ))}
              {loaded && visible.length === 0 ? (
                <li className="p-8 text-center text-sm text-sage">Aucune offre ne correspond.</li>
              ) : null}
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}
