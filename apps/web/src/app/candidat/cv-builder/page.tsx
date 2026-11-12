"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { CvPreview, A4_HEIGHT, A4_WIDTH } from "@/components/cv/preview";
import { scoreDoc, type StepId } from "@/components/cv/score";
import {
  StepCompetences,
  StepExperience,
  StepExport,
  StepFormation,
  StepIdentite,
  StepModele,
  StepProjets,
  StepResume,
  type JobLite,
  type StudioCtx,
} from "@/components/cv/steps";
import {
  cvToText,
  experienceYears,
  fromProfile,
  settingsOf,
  wordCount,
  type CvDoc,
  type Project,
  type Role,
  type School,
  type ServerProfile,
} from "@/components/cv/types";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const STEPS: { id: StepId; label: string; optional?: boolean }[] = [
  { id: "modele", label: "Modèle" },
  { id: "identite", label: "Identité" },
  { id: "experience", label: "Expérience" },
  { id: "formation", label: "Formation" },
  { id: "competences", label: "Compétences" },
  { id: "projets", label: "Projets", optional: true },
  { id: "resume", label: "Résumé" },
  { id: "export", label: "Révision" },
];

type SaveState = "saved" | "dirty" | "saving" | "error";

/* ---------- what can be saved, and how ---------- */

const savableRole = (role: Role) => role.title.trim().length >= 2 && role.company.trim().length >= 2 && /^\d{4}-\d{2}$/.test(role.start);
const savableSchool = (school: School) => school.school.trim().length >= 2;
const savableProject = (project: Project) => project.name.trim().length >= 2;

const rolePayload = (role: Role) => ({
  title: role.title.trim(),
  company: role.company.trim(),
  location: role.location.trim(),
  startDate: `${role.start}-01`,
  endDate: role.current || !role.end ? undefined : `${role.end}-01`,
  current: role.current,
  description: role.bullets,
});
const schoolPayload = (school: School) => ({
  school: school.school.trim(),
  degree: school.degree.trim(),
  field: school.field.trim(),
  startDate: school.start ? `${school.start}-01` : undefined,
  endDate: school.end ? `${school.end}-01` : undefined,
  description: school.bullets,
});
const projectPayload = (project: Project) => ({
  name: project.name.trim(),
  url: project.url.trim(),
  description: project.description,
});

const profileSig = (doc: CvDoc) => JSON.stringify([doc.headline.trim(), doc.summary.trim(), doc.location.trim(), doc.skills, doc.linkedin.trim()]);

type Snapshot = { profile: string; settings: string; years: number; items: Record<string, string> };

export default function CvStudioPage() {
  const { token } = useAuth();
  const [doc, setDoc] = useState<CvDoc | null>(null);
  const [jobs, setJobs] = useState<JobLite[]>([]);
  // Deep link from other pages: /candidat/cv-builder?step=competences. Nothing step-dependent renders before the CV loads,
  // so reading the URL in the initializer cannot cause a hydration mismatch.
  const [step, setStep] = useState<StepId>(() => {
    if (typeof window === "undefined") return "modele";
    const wanted = new URLSearchParams(window.location.search).get("step");
    return STEPS.find((item) => item.id === wanted)?.id ?? "modele";
  });
  const [status, setStatus] = useState<SaveState>("saved");
  const [error, setError] = useState("");
  const [pages, setPages] = useState<number | null>(null);
  const [view, setView] = useState<"edit" | "preview">("edit");
  const [publish, setPublish] = useState<{ state: "idle" | "working" | "done" | "error"; message: string }>({ state: "idle", message: "" });
  const [copied, setCopied] = useState(false);

  const latest = useRef<CvDoc | null>(null);
  const snap = useRef<Snapshot>({ profile: "", settings: "", years: -1, items: {} });
  const removed = useRef<{ kind: "exp" | "edu" | "proj"; id: string }[]>([]);
  const ids = useRef<Record<string, string>>({});
  const running = useRef(false);
  const rerun = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const ready = useRef(false);

  /* ---------- load ---------- */

  const load = useCallback(async () => {
    if (!token) return;
    const profile = await api<ServerProfile>("/candidates/me", { token });
    const next = fromProfile(profile);
    ids.current = {};
    removed.current = [];
    snap.current = {
      profile: profileSig(next),
      settings: JSON.stringify(settingsOf(next)),
      years: experienceYears(next),
      items: {
        ...Object.fromEntries(next.experiences.map((item) => [item.key, JSON.stringify(rolePayload(item))])),
        ...Object.fromEntries(next.educations.map((item) => [item.key, JSON.stringify(schoolPayload(item))])),
        ...Object.fromEntries(next.projects.map((item) => [item.key, JSON.stringify(projectPayload(item))])),
      },
    };
    latest.current = next;
    ready.current = true;
    setDoc(next);
    setStatus("saved");
  }, [token]);

  useEffect(() => {
    load().catch(() => setError("Impossible de charger votre profil."));
    if (token) api<JobLite[]>("/jobs", { token }).then(setJobs).catch(() => setJobs([]));
  }, [token, load]);

  /* ---------- autosave ---------- */

  function needsSave(d: CvDoc) {
    if (removed.current.length) return true;
    const hasRoles = d.experiences.some(savableRole);
    if (profileSig(d) !== snap.current.profile) return true;
    if (hasRoles && experienceYears(d) !== snap.current.years) return true;
    if (JSON.stringify(settingsOf(d)) !== snap.current.settings) return true;
    const dirty = (key: string, id: string | undefined, sig: string) => !(id ?? ids.current[key]) || snap.current.items[key] !== sig;
    return (
      d.experiences.some((item) => savableRole(item) && dirty(item.key, item.id, JSON.stringify(rolePayload(item)))) ||
      d.educations.some((item) => savableSchool(item) && dirty(item.key, item.id, JSON.stringify(schoolPayload(item)))) ||
      d.projects.some((item) => savableProject(item) && dirty(item.key, item.id, JSON.stringify(projectPayload(item))))
    );
  }

  async function syncOnce(d: CvDoc) {
    if (!token) return;
    const hasRoles = d.experiences.some(savableRole);
    const years = experienceYears(d);

    const pSig = profileSig(d);
    if (pSig !== snap.current.profile || (hasRoles && years !== snap.current.years)) {
      await api("/candidates/me", {
        method: "PATCH",
        token,
        body: {
          headline: d.headline.trim(),
          bio: d.summary.trim(),
          location: d.location.trim(),
          skills: d.skills,
          linkedinUrl: d.linkedin.trim(),
          ...(hasRoles ? { experienceYears: years } : {}),
        },
      });
      snap.current.profile = pSig;
      if (hasRoles) snap.current.years = years;
    }

    const sSig = JSON.stringify(settingsOf(d));
    if (sSig !== snap.current.settings) {
      await api("/candidates/me", { method: "PATCH", token, body: { cvSettings: settingsOf(d) } });
      snap.current.settings = sSig;
    }

    const paths = { exp: "experiences", edu: "educations", proj: "projects" } as const;
    while (removed.current.length) {
      const item = removed.current[0];
      await api(`/candidates/me/${paths[item.kind]}/${item.id}`, { method: "DELETE", token });
      removed.current.shift();
    }

    async function saveItem<T extends { key: string; id?: string }>(kind: "exp" | "edu" | "proj", item: T, payload: object, apply: (id: string) => void) {
      const sig = JSON.stringify(payload);
      const id = item.id ?? ids.current[item.key];
      if (id && snap.current.items[item.key] === sig) return;
      if (id) {
        await api(`/candidates/me/${paths[kind]}/${id}`, { method: "PATCH", token, body: payload });
      } else {
        const created = await api<{ id: string }>(`/candidates/me/${paths[kind]}`, { method: "POST", token, body: payload });
        ids.current[item.key] = created.id;
        apply(created.id);
      }
      snap.current.items[item.key] = sig;
    }

    for (const item of d.experiences) {
      if (!savableRole(item)) continue;
      await saveItem("exp", item, rolePayload(item), (id) =>
        setDoc((current) => (current ? { ...current, experiences: current.experiences.map((row) => (row.key === item.key ? { ...row, id } : row)) } : current)),
      );
    }
    for (const item of d.educations) {
      if (!savableSchool(item)) continue;
      await saveItem("edu", item, schoolPayload(item), (id) =>
        setDoc((current) => (current ? { ...current, educations: current.educations.map((row) => (row.key === item.key ? { ...row, id } : row)) } : current)),
      );
    }
    for (const item of d.projects) {
      if (!savableProject(item)) continue;
      await saveItem("proj", item, projectPayload(item), (id) =>
        setDoc((current) => (current ? { ...current, projects: current.projects.map((row) => (row.key === item.key ? { ...row, id } : row)) } : current)),
      );
    }
  }

  const flush = useCallback(async () => {
    if (!latest.current) return;
    if (running.current) {
      rerun.current = true;
      return;
    }
    running.current = true;
    setStatus("saving");
    setError("");
    try {
      do {
        rerun.current = false;
        await syncOnce(latest.current as CvDoc);
      } while (rerun.current);
      setStatus("saved");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Enregistrement impossible.");
    } finally {
      running.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!ready.current || !doc) return;
    latest.current = doc;
    if (!needsSave(doc)) {
      if (!running.current) setStatus((current) => (current === "error" ? current : "saved"));
      return;
    }
    if (!running.current) setStatus("dirty");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 900);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, flush]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (status === "dirty" || status === "saving") {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [status]);

  /* ---------- editing helpers ---------- */

  const update = useCallback((patch: Partial<CvDoc>) => setDoc((current) => (current ? { ...current, ...patch } : current)), []);

  const removeItem = useCallback((kind: "exp" | "edu" | "proj", key: string) => {
    setDoc((current) => {
      if (!current) return current;
      const list = kind === "exp" ? current.experiences : kind === "edu" ? current.educations : current.projects;
      const found = list.find((item) => item.key === key);
      const id = found?.id ?? ids.current[key];
      if (id) removed.current.push({ kind, id });
      delete snap.current.items[key];
      return {
        ...current,
        experiences: kind === "exp" ? current.experiences.filter((item) => item.key !== key) : current.experiences,
        educations: kind === "edu" ? current.educations.filter((item) => item.key !== key) : current.educations,
        projects: kind === "proj" ? current.projects.filter((item) => item.key !== key) : current.projects,
      };
    });
  }, []);

  /* ---------- score, export ---------- */

  const result = useMemo(() => (doc ? scoreDoc(doc, pages) : { score: 0, checks: [] }), [doc, pages]);


  async function publishCv() {
    if (!token || !doc) return;
    setPublish({ state: "working", message: "" });
    try {
      await api("/ai/cv/publish", { token, body: { text: cvToText(doc) } });
      setPublish({ state: "done", message: "CV publié : il est visible des recruteurs et utilisé par l'analyse ATS." });
    } catch (err) {
      setPublish({ state: "error", message: err instanceof Error ? err.message : "Publication impossible." });
    }
  }

  async function copyText() {
    if (!doc) return;
    try {
      await navigator.clipboard.writeText(cvToText(doc));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Copie impossible depuis ce navigateur.");
    }
  }

  /* ---------- render ---------- */

  if (!doc) {
    return (
      <AppShell role="CANDIDATE" plain>
        <p className="text-sm text-sage">{error || "Chargement de votre CV…"}</p>
      </AppShell>
    );
  }

  const ctx: StudioCtx = {
    doc,
    update,
    token,
    jobs,
    go: setStep,
    removeItem,
    hasProfileData: doc.experiences.length > 0 || doc.educations.length > 0,
    reload: load,
  };

  const done: Record<StepId, boolean> = {
    modele: true,
    identite: Boolean(doc.headline.trim() && doc.email.trim()),
    resume: wordCount(doc.summary) >= 30,
    experience: doc.experiences.some(savableRole),
    formation: doc.educations.some(savableSchool),
    competences: doc.skills.length >= 3,
    projets: doc.projects.some(savableProject),
    export: result.score >= 80,
  };

  const index = STEPS.findIndex((item) => item.id === step);
  const goto = (id: StepId) => {
    setStep(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const statusLabel =
    status === "saving" ? "Enregistrement…" : status === "dirty" ? "Modifications en cours…" : status === "error" ? "Échec de l'enregistrement" : "Enregistré";

  return (
    <AppShell role="CANDIDATE" plain>
      <div className="print:hidden">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Créateur de CV</h1>
            <p className="mt-1 text-sage">Un CV propre, lisible par les logiciels de recrutement, mis à jour au fil de la frappe.</p>
          </div>
          <div className="flex items-center gap-3">
            <span
              role="status"
              aria-live="polite"
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${
                status === "error" ? "bg-red-50 text-red-700" : status === "saved" ? "bg-emerald-50 text-good" : "bg-tint text-forest"
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${status === "saved" ? "bg-good" : status === "error" ? "bg-red-600" : "animate-pulse bg-forest"}`} />
              {statusLabel}
            </span>
            {status === "error" ? (
              <button type="button" onClick={() => void flush()} className="rounded-full border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50">
                Réessayer
              </button>
            ) : null}
            <button type="button" onClick={() => window.print()} className="hidden rounded-full bg-forest px-5 py-2 text-sm font-semibold text-white transition active:scale-95 sm:block">
              PDF
            </button>
          </div>
        </div>
        {error && status === "error" ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}

        {/* mobile: edit / preview switch */}
        <div className="mt-4 flex gap-2 xl:hidden" role="tablist" aria-label="Affichage">
          {(["edit", "preview"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={view === value}
              onClick={() => setView(value)}
              className={`flex-1 rounded-full border px-4 py-2 text-sm font-semibold transition ${view === value ? "border-forest bg-forest text-white" : "border-line bg-white"}`}
            >
              {value === "edit" ? "Éditer" : "Aperçu"}
            </button>
          ))}
        </div>

        <div className="mt-6 grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[190px_minmax(0,560px)_minmax(0,1fr)]">
          {/* Steps */}
          <nav aria-label="Étapes du CV" className={`${view === "preview" ? "hidden xl:block" : ""} xl:sticky xl:top-20`}>
            <ol className="flex gap-2 overflow-x-auto pb-1 xl:block xl:space-y-1 xl:overflow-visible">
              {STEPS.map((item, position) => {
                const active = item.id === step;
                return (
                  <li key={item.id} className="shrink-0">
                    <button
                      type="button"
                      onClick={() => goto(item.id)}
                      aria-current={active ? "step" : undefined}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition ${
                        active ? "bg-tint font-semibold text-forest" : "text-ink hover:bg-paper"
                      }`}
                    >
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                          done[item.id] && item.id !== "modele" ? "bg-forest text-white" : active ? "border-2 border-forest text-forest" : "border border-line text-sage"
                        }`}
                      >
                        {done[item.id] && item.id !== "modele" ? "✓" : position + 1}
                      </span>
                      <span className="whitespace-nowrap">
                        {item.label}
                        {item.optional ? <span className="ml-1 text-[11px] font-normal text-sage">facultatif</span> : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
            <div className="mt-4 hidden rounded-xl border border-line bg-white p-3 xl:block">
              <p className="text-xs text-sage">Score du CV</p>
              <p className="mt-0.5 text-2xl font-bold text-forest">{result.score}</p>
              <button type="button" onClick={() => goto("export")} className="mt-1 text-xs font-semibold text-forest hover:underline">
                Voir le détail
              </button>
            </div>
          </nav>

          {/* Editor */}
          <section className={`${view === "preview" ? "hidden xl:block" : ""} min-w-0`}>
            <div key={step} className="page-in">
              {step === "modele" ? <StepModele ctx={ctx} /> : null}
              {step === "identite" ? <StepIdentite ctx={ctx} /> : null}
              {step === "resume" ? <StepResume ctx={ctx} /> : null}
              {step === "experience" ? <StepExperience ctx={ctx} /> : null}
              {step === "formation" ? <StepFormation ctx={ctx} /> : null}
              {step === "competences" ? <StepCompetences ctx={ctx} /> : null}
              {step === "projets" ? <StepProjets ctx={ctx} /> : null}
              {step === "export" ? (
                <StepExport ctx={ctx} score={result.score} checks={result.checks} pages={pages} onPrint={() => window.print()} onPublish={() => void publishCv()} onCopy={() => void copyText()} publish={publish} />
              ) : null}
            </div>

            <div className="mt-8 flex items-center justify-between border-t border-line pt-5">
              <button
                type="button"
                onClick={() => index > 0 && goto(STEPS[index - 1].id)}
                disabled={index === 0}
                className="rounded-full px-5 py-2.5 text-sm font-semibold text-sage transition hover:text-ink disabled:invisible"
              >
                ← Précédent
              </button>
              {index < STEPS.length - 1 ? (
                <button
                  type="button"
                  onClick={() => goto(STEPS[index + 1].id)}
                  className="rounded-full bg-forest px-6 py-2.5 text-sm font-semibold text-white transition active:scale-95"
                >
                  Continuer : {STEPS[index + 1].label} →
                </button>
              ) : (
                <span className="text-sm font-medium text-good">{copied ? "Texte copié ✓" : ""}</span>
              )}
            </div>
          </section>

          {/* Live preview */}
          <aside className={`${view === "edit" ? "hidden xl:block" : ""} min-w-0 xl:sticky xl:top-20`}>
            <PreviewPane doc={doc} pages={pages} onHeight={(height) => setPages(Math.max(1, Math.ceil((height - 2) / A4_HEIGHT)))} />
          </aside>
        </div>
      </div>

      {/* Printed copy: unscaled A4, only visible when printing */}
      <div className="cv-print hidden print:block">
        <CvPreview doc={doc} />
      </div>
    </AppShell>
  );
}

/** The sheet scaled to the width of its column, with a marker where each A4 page ends. */
function PreviewPane({ doc, pages, onHeight }: { doc: CvDoc; pages: number | null; onHeight: (height: number) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.6);
  const [height, setHeight] = useState(A4_HEIGHT);

  useEffect(() => {
    const node = box.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setScale(Math.min(1, node.clientWidth / A4_WIDTH)));
    observer.observe(node);
    setScale(Math.min(1, node.clientWidth / A4_WIDTH));
    return () => observer.disconnect();
  }, []);

  const handleHeight = useCallback(
    (value: number) => {
      setHeight(value);
      onHeight(value);
    },
    [onHeight],
  );

  const breaks = Array.from({ length: Math.max(0, (pages ?? 1) - 1) }, (_, i) => (i + 1) * A4_HEIGHT);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs text-sage">
        <span className="font-semibold text-ink">Aperçu en direct</span>
        <span className={pages && pages > 2 ? "font-semibold text-warn" : ""}>
          {pages ? `≈ ${pages} page${pages > 1 ? "s" : ""} A4` : ""}
          {pages && pages > 2 ? " : condensez" : ""}
        </span>
      </div>
      <div ref={box} className="w-full overflow-hidden rounded-xl border border-line bg-[#e8edf5] p-0 shadow-sm">
        <div style={{ height: height * scale, width: "100%" }}>
          <div style={{ width: A4_WIDTH, transform: `scale(${scale})`, transformOrigin: "top left", position: "relative" }}>
            <CvPreview doc={doc} onHeight={handleHeight} />
            {breaks.map((top) => (
              <div key={top} style={{ position: "absolute", left: 0, right: 0, top, borderTop: "2px dashed #94a3b8" }} aria-hidden>
                <span style={{ position: "absolute", right: 12, top: 4, fontSize: 11, color: "#64748b", background: "#fff", padding: "0 6px", borderRadius: 4 }}>Saut de page</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
