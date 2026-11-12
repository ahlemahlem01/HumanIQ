"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Job = { id: string; title: string; status: string; company: { name: string } };

export default function ModerationPage() {
  const { token } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);

  async function load() {
    if (!token) return;
    setJobs(await api<Job[]>("/admin/jobs", { token }));
  }

  useEffect(() => {
    load();
  }, [token]);

  async function moderate(id: string, status: string) {
    if (!token) return;
    await api(`/admin/jobs/${id}`, { method: "PATCH", token, body: { status } });
    load();
  }

  return (
    <AppShell role="ADMIN" title="Modération des annonces">
      <ul className="space-y-3">
        {jobs.map((job) => (
          <li key={job.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-cream px-4 py-3">
            <div>
              <p className="font-medium">{job.title}</p>
              <p className="text-sm text-forest/60">
                {job.company.name} · {job.status}
              </p>
            </div>
            <div className="flex gap-2 text-sm">
              <button onClick={() => moderate(job.id, "PUBLISHED")} className="rounded-full border border-line px-3 py-1">
                Publier
              </button>
              <button onClick={() => moderate(job.id, "PAUSED")} className="rounded-full border border-line px-3 py-1">
                Suspendre
              </button>
            </div>
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
