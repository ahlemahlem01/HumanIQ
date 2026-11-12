"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell, useShellSearch } from "@/components/app-shell";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type CvCard = {
  id: string;
  name: string;
  email: string;
  headline: string | null;
  location: string | null;
  experienceYears: number;
  skills: string[];
  fileName: string | null;
  preview: string;
};

function CvLibraryPageContent() {
  const { token } = useAuth();
  const { query } = useShellSearch();
  const [rows, setRows] = useState<CvCard[] | null>(null);
  const [skillFilter, setSkillFilter] = useState("");

  useEffect(() => {
    if (!token) return;
    api<CvCard[]>("/candidates/cvtheque", { token }).then(setRows).catch(() => setRows([]));
  }, [token]);

  const topSkills = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows ?? []) for (const skill of row.skills) counts.set(skill, (counts.get(skill) ?? 0) + 1);
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([skill]) => skill);
  }, [rows]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (rows ?? []).filter((row) => {
      if (skillFilter && !row.skills.includes(skillFilter)) return false;
      if (!needle) return true;
      return `${row.name} ${row.email} ${row.headline ?? ""} ${row.location ?? ""} ${row.skills.join(" ")} ${row.preview}`
        .toLowerCase()
        .includes(needle);
    });
  }, [query, rows, skillFilter]);

  return (
    <>
      <div className="mx-auto max-w-[900px]">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight">CVthèque</h1>
          <p className="mt-1 text-sage">
            {rows === null ? "Chargement…" : `${visible.length} CV déposé${visible.length > 1 ? "s" : ""} par des candidats.`}
          </p>
        </header>

        {topSkills.length > 0 ? (
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSkillFilter("")}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
                skillFilter === "" ? "border-forest bg-forest text-white" : "border-line bg-white hover:border-forest"
              }`}
            >
              Tous
            </button>
            {topSkills.map((skill) => (
              <button
                key={skill}
                type="button"
                onClick={() => setSkillFilter((current) => (current === skill ? "" : skill))}
                className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
                  skillFilter === skill ? "border-forest bg-tint text-forest" : "border-line bg-white hover:border-forest"
                }`}
              >
                {skill}
              </button>
            ))}
          </div>
        ) : null}

        <ul className="mt-5 space-y-3">
          {rows && visible.length === 0 ? (
            <li className="rounded-2xl border border-dashed border-line bg-white px-5 py-10 text-center text-sm text-sage">
              Aucun CV pour cette recherche.
            </li>
          ) : null}
          {visible.map((row) => (
            <li key={row.id} className="rounded-2xl border border-line bg-white p-5">
              <div className="flex gap-4">
                <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-tint text-lg font-semibold text-forest">
                  {initials(row.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={`/recruteur/cvtheque/${row.id}`} className="text-lg font-semibold hover:text-forest hover:underline">
                        {row.name}
                      </Link>
                      <p className="text-sm">{row.headline || "Sans titre"}</p>
                      <p className="text-sm text-sage">
                        {row.location || "Lieu non précisé"} · {row.experienceYears} an{row.experienceYears > 1 ? "s" : ""} d&apos;expérience
                      </p>
                    </div>
                    <span className="flex shrink-0 items-center gap-1.5 rounded-md bg-paper px-3 py-1 text-xs font-medium text-sage">
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
                        <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm7 1.5V9h4.5" strokeLinejoin="round" />
                      </svg>
                      {row.fileName ?? "CV"}
                    </span>
                  </div>
                  {row.preview ? <p className="mt-3 line-clamp-2 text-[15px] leading-6">{row.preview}</p> : null}
                  {row.skills.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {row.skills.slice(0, 6).map((skill) => (
                        <span
                          key={skill}
                          className={`rounded-full border px-3 py-0.5 text-xs font-medium ${
                            skill === skillFilter ? "border-forest bg-tint text-forest" : "border-line"
                          }`}
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="mt-4 border-t border-line pt-4">
                <Link
                  href={`/recruteur/cvtheque/${row.id}`}
                  className="inline-block rounded-full bg-forest px-5 py-2 text-sm font-semibold text-white"
                >
                  Lire le CV
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

// The content must sit INSIDE AppShell: useShellSearch() reads the search box of the shell's header.
export default function CvLibraryPage() {
  return (
    <AppShell role="RECRUITER" plain>
      <CvLibraryPageContent />
    </AppShell>
  );
}
