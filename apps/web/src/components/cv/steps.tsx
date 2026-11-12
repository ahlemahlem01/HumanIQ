"use client";

import { useState } from "react";
import { api, upload } from "@/lib/api";
import { AreaField, Card, Chip, Field, RemoveButton, SaveHint, StepHeader, TextField, inputClass } from "./fields";
import { CvPreview } from "./preview";
import { ACTION_START, keywordCoverage, type Check, type StepId } from "./score";
import {
  ACCENTS,
  SECTIONS,
  bulletLines,
  emptyProject,
  emptyRole,
  emptySchool,
  experienceYears,
  fullName,
  periodLabel,
  wordCount,
  type CvDoc,
  type Project,
  type Role,
  type School,
  type SectionId,
  type Template,
} from "./types";

export type JobLite = { id: string; title: string; requiredSkills: string[]; company: { name: string } };

export type StudioCtx = {
  doc: CvDoc;
  update: (patch: Partial<CvDoc>) => void;
  token: string | null;
  jobs: JobLite[];
  go: (step: StepId) => void;
  removeItem: (kind: "exp" | "edu" | "proj", key: string) => void;
  hasProfileData: boolean;
  reload: () => Promise<void>;
};

const TEMPLATES: { id: Template; name: string; blurb: string; ats: string }[] = [
  { id: "classic", name: "Classique", blurb: "Une colonne, sobre. Le plus lisible pour les logiciels de recrutement.", ats: "Compatibilité ATS maximale" },
  { id: "modern", name: "Moderne", blurb: "Titres colorés et compétences en pastilles, sur une seule colonne.", ats: "Compatible ATS" },
  { id: "compact", name: "Compact", blurb: "Deux colonnes pour faire tenir un parcours dense sur une page.", ats: "Deux colonnes : certains ATS lisent moins bien" },
];

const LEVELS = ["Natif", "Courant", "Professionnel", "Intermédiaire", "Notions"];

/* ============ 1. Modèle ============ */

export function StepModele({ ctx }: { ctx: StudioCtx }) {
  const { doc, update, token, jobs } = ctx;
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState("");

  async function importFile(file: File) {
    if (!token) return;
    setImporting(true);
    setImportMessage("");
    try {
      await upload("/ai/cv/upload", file, { token });
      await ctx.reload();
      setImportMessage("CV lu : vos informations ont été reprises. Vérifiez chaque étape.");
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : "Lecture du fichier impossible.");
    } finally {
      setImporting(false);
    }
  }

  const target = jobs.find((job) => job.id === doc.targetJobId);

  return (
    <div>
      <StepHeader title="Choisissez un modèle" intro="Le contenu reste le même quand vous changez de modèle : essayez-les, rien n'est perdu." />

      {!ctx.hasProfileData ? (
        <Card className="mb-6 border-forest/30 bg-tint">
          <p className="font-semibold">Vous avez déjà un CV ?</p>
          <p className="mt-1 text-sm leading-6 text-sage">
            Importez un PDF, un Word ou un texte : nous remplissons vos expériences, formations et compétences. Vous corrigez ensuite ici.
          </p>
          <label className="mt-3 inline-block cursor-pointer rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-white transition active:scale-95">
            {importing ? "Lecture en cours…" : "Importer mon CV"}
            <input
              type="file"
              accept=".pdf,.docx,.txt,.md"
              className="hidden"
              disabled={importing}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (file) void importFile(file);
              }}
            />
          </label>
          {importMessage ? <p className="mt-2 text-sm font-medium text-forest">{importMessage}</p> : null}
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        {TEMPLATES.map((template) => {
          const active = doc.template === template.id;
          const scale = 0.2;
          return (
            <button
              key={template.id}
              type="button"
              onClick={() => update({ template: template.id })}
              aria-pressed={active}
              className={`rounded-2xl border-2 p-3 text-left transition hover:-translate-y-0.5 hover:shadow-md ${
                active ? "border-forest bg-tint" : "border-line bg-white hover:border-forest/50"
              }`}
            >
              <div className="overflow-hidden rounded-lg border border-line bg-white" style={{ height: 1123 * scale, width: "100%" }}>
                <div style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: 794 }}>
                  <CvPreview doc={{ ...doc, template: template.id }} />
                </div>
              </div>
              <p className="mt-3 font-semibold">{template.name}</p>
              <p className="mt-0.5 text-xs leading-5 text-sage">{template.blurb}</p>
              <p className={`mt-2 text-[11px] font-semibold ${template.id === "compact" ? "text-warn" : "text-good"}`}>{template.ats}</p>
            </button>
          );
        })}
      </div>

      <Card className="mt-5">
        <p className="text-sm font-medium">Couleur d&apos;accent</p>
        <div className="mt-3 flex flex-wrap gap-3" role="radiogroup" aria-label="Couleur d'accent">
          {ACCENTS.map((color) => (
            <button
              key={color}
              type="button"
              role="radio"
              aria-checked={doc.accent === color}
              aria-label={color}
              onClick={() => update({ accent: color })}
              className={`h-9 w-9 rounded-full border-2 transition active:scale-90 ${doc.accent === color ? "border-ink ring-2 ring-white ring-offset-2 ring-offset-ink/20" : "border-white shadow"}`}
              style={{ background: color }}
            />
          ))}
        </div>
      </Card>

      <Card className="mt-4">
        <p className="text-sm font-medium">Sections affichées</p>
        <p className="mt-1 text-xs text-sage">Masquer une section ne supprime rien : elle reste enregistrée.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {SECTIONS.map((section) => {
            const shown = !doc.hiddenSections.includes(section.id);
            return (
              <Chip
                key={section.id}
                active={shown}
                onClick={() =>
                  update({
                    hiddenSections: shown
                      ? [...doc.hiddenSections, section.id as SectionId]
                      : doc.hiddenSections.filter((id) => id !== section.id),
                  })
                }
              >
                {shown ? "✓ " : ""}
                {section.label}
              </Chip>
            );
          })}
        </div>
      </Card>

      <Card className="mt-4">
        <Field label="Offre visée (facultatif)" hint="Nous comparons votre CV aux compétences de l'offre et vous disons ce qui manque. Rien n'est ajouté à votre place.">
          {(id) => (
            <select id={id} value={doc.targetJobId} onChange={(event) => update({ targetJobId: event.target.value })} className={inputClass}>
              <option value="">Aucune : CV généraliste</option>
              {jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.title} — {job.company.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        {target ? <p className="mt-2 text-xs text-sage">Compétences demandées : {target.requiredSkills.join(", ")}</p> : null}
      </Card>
    </div>
  );
}

/* ============ 2. Identité ============ */

export function StepIdentite({ ctx }: { ctx: StudioCtx }) {
  const { doc, update } = ctx;
  return (
    <div>
      <StepHeader title="Qui êtes-vous ?" intro="Ces informations sont en haut du CV. Un recruteur doit voir en deux secondes votre métier et comment vous joindre." />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Nom affiché sur le CV"
          className="sm:col-span-2"
          value={doc.displayName}
          onChange={(event) => update({ displayName: event.target.value })}
          placeholder={`${doc.firstName} ${doc.lastName}`}
          hint="Laissez vide pour utiliser le nom de votre compte."
        />
        <TextField
          label="Titre professionnel"
          className="sm:col-span-2"
          value={doc.headline}
          onChange={(event) => update({ headline: event.target.value })}
          placeholder="Ingénieure fullstack TypeScript"
          hint="Votre métier et votre spécialité, en 2 à 12 mots. Exemple : « Product designer, systèmes de design »."
        />
        <TextField label="Ville" value={doc.location} onChange={(event) => update({ location: event.target.value })} placeholder="Tunis, ou Remote" />
        <TextField label="Téléphone" value={doc.phone} onChange={(event) => update({ phone: event.target.value })} placeholder="+216 20 000 000" inputMode="tel" />
        <TextField label="E-mail" className="sm:col-span-2" type="email" value={doc.email} onChange={(event) => update({ email: event.target.value })} placeholder="prenom.nom@mail.com" />
        <TextField label="LinkedIn" value={doc.linkedin} onChange={(event) => update({ linkedin: event.target.value })} placeholder="linkedin.com/in/votre-nom" />
        <TextField label="Portfolio ou site" value={doc.website} onChange={(event) => update({ website: event.target.value })} placeholder="votre-site.com" />
        <TextField label="GitHub (facultatif)" className="sm:col-span-2" value={doc.github} onChange={(event) => update({ github: event.target.value })} placeholder="github.com/votre-nom" />
      </div>
    </div>
  );
}

/* ============ 3. Résumé ============ */

export function StepResume({ ctx }: { ctx: StudioCtx }) {
  const { doc, update, token, jobs } = ctx;
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [tips, setTips] = useState<string[]>([]);
  const [error, setError] = useState("");

  const words = wordCount(doc.summary);
  const tone = words === 0 ? "bg-line" : words >= 30 && words <= 90 ? "bg-good" : "bg-warn";

  async function suggest() {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const target = jobs.find((job) => job.id === doc.targetJobId);
      const last = doc.experiences.find((role) => role.title.trim());
      const result = await api<{ suggestions: string[]; tips: string[] }>("/ai/cv/assist", {
        token,
        body: {
          kind: "summary",
          headline: doc.headline,
          years: experienceYears(doc),
          skills: doc.skills,
          lastRole: last ? { title: last.title, company: last.company } : null,
          targetTitle: target?.title,
        },
      });
      setSuggestions(result.suggestions);
      setTips(result.tips);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Suggestions indisponibles.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <StepHeader title="Votre résumé" intro="Trois ou quatre phrases : qui vous êtes, ce que vous savez faire, ce que vous cherchez. C'est souvent la seule chose lue en entier. On le rédige en dernier, quand le reste est prêt." />
      {doc.skills.length === 0 && doc.experiences.length === 0 ? (
        <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm leading-6 text-warn">
          Il manque encore vos expériences et vos compétences : les suggestions seront bien plus utiles une fois ces étapes remplies.{" "}
          <button type="button" onClick={() => ctx.go("experience")} className="font-semibold underline">
            Compléter l&apos;expérience
          </button>
        </p>
      ) : null}
      <AreaField
        label="Résumé"
        rows={6}
        value={doc.summary}
        onChange={(event) => update({ summary: event.target.value })}
        placeholder="Ingénieure fullstack avec 5 ans d'expérience sur des produits B2B. J'aime relier l'IA aux besoins des métiers…"
      />
      <div className="mt-2 flex items-center gap-3 text-xs text-sage">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
          <div className={`h-full rounded-full transition-all duration-300 ${tone}`} style={{ width: `${Math.min(100, (words / 70) * 100)}%` }} />
        </div>
        <span className={words >= 30 && words <= 90 ? "font-semibold text-good" : ""}>{words} mots · idéal 40 à 70</span>
      </div>

      <div className="mt-5">
        <button
          type="button"
          onClick={() => void suggest()}
          disabled={loading}
          className="rounded-full border border-forest px-5 py-2.5 text-sm font-semibold text-forest transition hover:bg-tint active:scale-95 disabled:opacity-60"
        >
          {loading ? "Rédaction…" : suggestions.length ? "Proposer d'autres formulations" : "Suggérer un résumé"}
        </button>
        <p className="mt-2 text-xs leading-5 text-sage">
          Les suggestions reprennent uniquement vos informations (titre, compétences, dernière expérience). Elles n&apos;ajoutent aucun fait : relisez et personnalisez.
        </p>
        {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
      </div>

      {suggestions.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {suggestions.map((text, index) => (
            <li key={index} className="rounded-2xl border border-line bg-white p-4">
              <p className="text-sm leading-6">{text}</p>
              <button
                type="button"
                onClick={() => update({ summary: text })}
                className="mt-3 rounded-full bg-forest px-4 py-1.5 text-xs font-semibold text-white transition active:scale-95"
              >
                {doc.summary.trim() ? "Remplacer mon résumé" : "Utiliser ce texte"}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {tips.length > 0 ? (
        <ul className="mt-5 space-y-1.5 text-sm text-sage">
          {tips.map((tip) => (
            <li key={tip} className="flex gap-2">
              <span className="text-forest">•</span>
              {tip}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/* ============ 4. Expérience ============ */

type BulletAnalysis = {
  lines: { text: string; issues: { code: string; message: string }[]; suggestion: string | null }[];
  verbs: string[];
};

function RoleCard({ role, ctx, open, onToggle }: { role: Role; ctx: StudioCtx; open: boolean; onToggle: () => void }) {
  const { doc, update, token } = ctx;
  const [analysis, setAnalysis] = useState<BulletAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const patch = (changes: Partial<Role>) =>
    update({ experiences: doc.experiences.map((item) => (item.key === role.key ? { ...item, ...changes } : item)) });

  const lines = bulletLines(role.bullets);
  const complete = role.title.trim().length >= 2 && role.company.trim().length >= 2 && Boolean(role.start);

  async function analyze() {
    if (!token) return;
    setAnalyzing(true);
    try {
      setAnalysis(await api<BulletAnalysis>("/ai/cv/assist", { token, body: { kind: "bullets", text: role.bullets } }));
    } finally {
      setAnalyzing(false);
    }
  }

  function applySuggestion(index: number, text: string) {
    const next = [...lines];
    next[index] = text;
    patch({ bullets: next.join("\n") });
    setAnalysis(null);
  }

  return (
    <li className="rounded-2xl border border-line bg-white">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 p-4 text-left">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line bg-paper text-sm font-bold text-forest">
          {(role.company || role.title || "?")[0]?.toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{role.title || "Nouveau poste"}</span>
          <span className="block truncate text-sm text-sage">
            {[role.company, periodLabel(role.start, role.end, role.current)].filter(Boolean).join(" · ") || "À renseigner"}
          </span>
        </span>
        <SaveHint complete={complete} what="le poste, l'entreprise et la date de début" />
        <span className={`text-sage transition-transform ${open ? "rotate-180" : ""}`} aria-hidden>
          ⌄
        </span>
      </button>

      {open ? (
        <div className="space-y-4 border-t border-line p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Poste" value={role.title} onChange={(event) => patch({ title: event.target.value })} placeholder="Lead technique" />
            <TextField label="Entreprise" value={role.company} onChange={(event) => patch({ company: event.target.value })} placeholder="Studio interne" />
            <TextField label="Lieu" value={role.location} onChange={(event) => patch({ location: event.target.value })} placeholder="Paris" />
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Début" type="month" value={role.start} onChange={(event) => patch({ start: event.target.value })} />
              <TextField label="Fin" type="month" value={role.end} disabled={role.current} onChange={(event) => patch({ end: event.target.value })} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={role.current}
              onChange={(event) => patch({ current: event.target.checked, end: event.target.checked ? "" : role.end })}
              className="h-4 w-4 accent-[#1a3585]"
            />
            J&apos;occupe encore ce poste
          </label>

          <div>
            <AreaField
              label="Réalisations (une par ligne)"
              rows={6}
              value={role.bullets}
              onChange={(event) => {
                setAnalysis(null);
                patch({ bullets: event.target.value });
              }}
              placeholder={"Conçu un pipeline de candidatures utilisé par 40 recruteurs\nRéduit de 40 % le temps de build en migrant vers Vite\nEncadré une équipe de 4 développeurs"}
              hint="Commencez par un verbe d'action et, si possible, ajoutez un chiffre."
            />

            {lines.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {lines.map((line, index) => {
                  const noVerb = !ACTION_START.test(line);
                  const noNumber = !/\d/.test(line);
                  return (
                    <li key={index} className="flex items-start gap-2 text-xs">
                      <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${!noVerb && !noNumber ? "bg-emerald-100 text-good" : "bg-amber-100 text-warn"}`}>
                        {!noVerb && !noNumber ? "✓" : "!"}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sage">{line}</span>
                      {noVerb ? <Chip tone="warn">verbe d&apos;action</Chip> : null}
                      {noNumber ? <Chip tone="warn">chiffre</Chip> : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}

            {lines.length > 0 ? (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => void analyze()}
                  disabled={analyzing}
                  className="rounded-full border border-forest px-4 py-1.5 text-xs font-semibold text-forest transition hover:bg-tint active:scale-95 disabled:opacity-60"
                >
                  {analyzing ? "Analyse…" : "Nettoyer mes réalisations"}
                </button>
              </div>
            ) : null}

            {analysis ? (
              <div className="mt-3 rounded-xl bg-paper p-3 text-sm">
                {analysis.lines.some((line) => line.suggestion) ? (
                  <ul className="space-y-2">
                    {analysis.lines.map((line, index) =>
                      line.suggestion ? (
                        <li key={index} className="flex items-center gap-3">
                          <span className="min-w-0 flex-1">
                            <span className="block text-xs text-sage line-through">{line.text}</span>
                            <span className="block">{line.suggestion}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => applySuggestion(index, line.suggestion as string)}
                            className="shrink-0 rounded-full bg-forest px-3 py-1 text-xs font-semibold text-white active:scale-95"
                          >
                            Appliquer
                          </button>
                        </li>
                      ) : null,
                    )}
                  </ul>
                ) : (
                  <p className="text-sage">Rien à nettoyer automatiquement : la mise en forme est propre.</p>
                )}
                {analysis.lines.some((line) => line.issues.some((issue) => issue.code === "no-verb")) ? (
                  <p className="mt-3 text-xs text-sage">
                    Idées de verbes pour démarrer une réalisation : {analysis.verbs.join(" · ")}. Choisissez-en un seulement s&apos;il décrit ce que vous avez réellement fait.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="flex justify-end">
            <RemoveButton onConfirm={() => ctx.removeItem("exp", role.key)} label="Supprimer cette expérience" />
          </div>
        </div>
      ) : null}
    </li>
  );
}

export function StepExperience({ ctx }: { ctx: StudioCtx }) {
  const { doc, update } = ctx;
  const [openKey, setOpenKey] = useState<string | null>(doc.experiences[0]?.key ?? null);

  function add() {
    const role = emptyRole();
    update({ experiences: [role, ...doc.experiences] });
    setOpenKey(role.key);
  }

  return (
    <div>
      <StepHeader
        title="Votre expérience"
        intro="Du plus récent au plus ancien. Pour chaque poste, détaillez ce que vous avez réalisé, pas seulement vos missions : deux à quatre lignes suffisent."
      />
      <ul className="space-y-3">
        {doc.experiences.map((role) => (
          <RoleCard key={role.key} role={role} ctx={ctx} open={openKey === role.key} onToggle={() => setOpenKey(openKey === role.key ? null : role.key)} />
        ))}
      </ul>
      {doc.experiences.length === 0 ? (
        <Card className="border-dashed text-center">
          <p className="font-medium">Aucune expérience pour l&apos;instant</p>
          <p className="mt-1 text-sm text-sage">Stage, emploi, freelance, projet associatif : tout ce qui montre ce que vous savez faire compte.</p>
        </Card>
      ) : null}
      <button
        type="button"
        onClick={add}
        className="mt-4 rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-white transition active:scale-95"
      >
        + Ajouter une expérience
      </button>
    </div>
  );
}

/* ============ 5. Formation ============ */

function SchoolCard({ school, ctx, open, onToggle }: { school: School; ctx: StudioCtx; open: boolean; onToggle: () => void }) {
  const { doc, update } = ctx;
  const patch = (changes: Partial<School>) =>
    update({ educations: doc.educations.map((item) => (item.key === school.key ? { ...item, ...changes } : item)) });
  const complete = school.school.trim().length >= 2;
  return (
    <li className="rounded-2xl border border-line bg-white">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 p-4 text-left">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line bg-paper text-sm font-bold text-forest">
          {(school.school || "?")[0]?.toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{[school.degree, school.field].filter(Boolean).join(", ") || school.school || "Nouvelle formation"}</span>
          <span className="block truncate text-sm text-sage">{[school.school, periodLabel(school.start, school.end, false)].filter(Boolean).join(" · ") || "À renseigner"}</span>
        </span>
        <SaveHint complete={complete} what="l'établissement" />
        <span className={`text-sage transition-transform ${open ? "rotate-180" : ""}`} aria-hidden>
          ⌄
        </span>
      </button>
      {open ? (
        <div className="space-y-4 border-t border-line p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Établissement" className="sm:col-span-2" value={school.school} onChange={(event) => patch({ school: event.target.value })} placeholder="Université Paris Cité" />
            <TextField label="Diplôme" value={school.degree} onChange={(event) => patch({ degree: event.target.value })} placeholder="Master" />
            <TextField label="Domaine" value={school.field} onChange={(event) => patch({ field: event.target.value })} placeholder="Informatique" />
            <TextField label="Début" type="month" value={school.start} onChange={(event) => patch({ start: event.target.value })} />
            <TextField label="Fin (ou prévue)" type="month" value={school.end} onChange={(event) => patch({ end: event.target.value })} />
          </div>
          <AreaField label="Détails (facultatif)" rows={3} value={school.bullets} onChange={(event) => patch({ bullets: event.target.value })} placeholder="Mention, projet de fin d'études, spécialisation…" />
          <div className="flex justify-end">
            <RemoveButton onConfirm={() => ctx.removeItem("edu", school.key)} label="Supprimer cette formation" />
          </div>
        </div>
      ) : null}
    </li>
  );
}

export function StepFormation({ ctx }: { ctx: StudioCtx }) {
  const { doc, update } = ctx;
  const [openKey, setOpenKey] = useState<string | null>(doc.educations[0]?.key ?? null);
  return (
    <div>
      <StepHeader title="Votre formation" intro="Diplômes et formations qui comptent pour le poste visé. Pas besoin de remonter au lycée." />
      <ul className="space-y-3">
        {doc.educations.map((school) => (
          <SchoolCard key={school.key} school={school} ctx={ctx} open={openKey === school.key} onToggle={() => setOpenKey(openKey === school.key ? null : school.key)} />
        ))}
      </ul>
      <button
        type="button"
        onClick={() => {
          const school = emptySchool();
          update({ educations: [school, ...doc.educations] });
          setOpenKey(school.key);
        }}
        className="mt-4 rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-white transition active:scale-95"
      >
        + Ajouter une formation
      </button>
    </div>
  );
}

/* ============ 6. Compétences ============ */

const POPULAR = ["TypeScript", "JavaScript", "React", "Node.js", "NestJS", "Python", "SQL", "PostgreSQL", "Docker", "Git", "Figma", "Scrum", "AWS", "Kubernetes", "Java"];

export function StepCompetences({ ctx }: { ctx: StudioCtx }) {
  const { doc, update, jobs } = ctx;
  const [draft, setDraft] = useState("");
  const target = jobs.find((job) => job.id === doc.targetJobId);
  const coverage = target ? keywordCoverage(doc, target.requiredSkills) : null;

  function addSkill(raw: string) {
    const parts = raw
      .split(/[,;\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (!parts.length) return;
    const next = [...doc.skills];
    for (const part of parts) if (!next.some((skill) => skill.toLowerCase() === part.toLowerCase())) next.push(part);
    update({ skills: next.slice(0, 40) });
    setDraft("");
  }

  const suggestions = (coverage ? coverage.missing : POPULAR).filter((skill) => !doc.skills.some((item) => item.toLowerCase() === skill.toLowerCase())).slice(0, 10);

  return (
    <div>
      <StepHeader title="Vos compétences" intro="Les mots que cherchent les recruteurs et les logiciels de recrutement. Écrivez-les comme dans les offres : « PostgreSQL », pas « bases de données »." />

      <Card>
        <div className="flex flex-wrap gap-2">
          {doc.skills.map((skill) => (
            <span key={skill} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-3 py-1 text-sm">
              {skill}
              <button type="button" aria-label={`Retirer ${skill}`} onClick={() => update({ skills: doc.skills.filter((item) => item !== skill) })} className="text-sage hover:text-red-700">
                ×
              </button>
            </span>
          ))}
        </div>
        <input
          value={draft}
          onChange={(event) => {
            const value = event.target.value;
            if (/[,;]/.test(value)) addSkill(value);
            else setDraft(value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addSkill(draft);
            }
            if (event.key === "Backspace" && !draft && doc.skills.length) update({ skills: doc.skills.slice(0, -1) });
          }}
          onBlur={() => addSkill(draft)}
          placeholder="Ajouter une compétence puis Entrée"
          aria-label="Ajouter une compétence"
          className={`${inputClass} mt-3`}
        />
        <p className={`mt-2 text-xs ${doc.skills.length >= 6 && doc.skills.length <= 18 ? "font-semibold text-good" : "text-sage"}`}>
          {doc.skills.length} compétence{doc.skills.length > 1 ? "s" : ""} · idéal : 6 à 15
        </p>
      </Card>

      {suggestions.length > 0 ? (
        <div className="mt-4">
          <p className="text-sm font-medium">{coverage ? `Demandées par « ${target?.title} » et absentes de votre CV` : "Idées courantes"}</p>
          <p className="mt-0.5 text-xs text-sage">{coverage ? "N'ajoutez que celles que vous maîtrisez réellement." : "Ajoutez uniquement celles que vous maîtrisez."}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {suggestions.map((skill) => (
              <Chip key={skill} tone={coverage ? "warn" : "neutral"} onClick={() => addSkill(skill)}>
                + {skill}
              </Chip>
            ))}
          </div>
        </div>
      ) : null}

      <Card className="mt-6">
        <p className="font-semibold">Langues</p>
        <ul className="mt-3 space-y-2">
          {doc.languages.map((language, index) => (
            <li key={index} className="flex gap-2">
              <input
                value={language.name}
                aria-label="Langue"
                placeholder="Français"
                onChange={(event) => update({ languages: doc.languages.map((item, i) => (i === index ? { ...item, name: event.target.value } : item)) })}
                className={inputClass}
              />
              <select
                value={language.level}
                aria-label="Niveau"
                onChange={(event) => update({ languages: doc.languages.map((item, i) => (i === index ? { ...item, level: event.target.value } : item)) })}
                className={`${inputClass} sm:w-48`}
              >
                <option value="">Niveau</option>
                {LEVELS.map((level) => (
                  <option key={level}>{level}</option>
                ))}
              </select>
              <button type="button" aria-label="Retirer la langue" onClick={() => update({ languages: doc.languages.filter((_, i) => i !== index) })} className="px-2 text-sage hover:text-red-700">
                ×
              </button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => update({ languages: [...doc.languages, { name: "", level: "" }] })} className="mt-3 text-sm font-semibold text-forest hover:underline">
          + Ajouter une langue
        </button>
      </Card>

      <Card className="mt-4">
        <p className="font-semibold">Certifications</p>
        <ul className="mt-3 space-y-2">
          {doc.certifications.map((cert, index) => (
            <li key={index} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1.5fr_1fr_90px_auto]">
              <input value={cert.name} aria-label="Certification" placeholder="AWS Cloud Practitioner" onChange={(event) => update({ certifications: doc.certifications.map((item, i) => (i === index ? { ...item, name: event.target.value } : item)) })} className={inputClass} />
              <input value={cert.issuer} aria-label="Organisme" placeholder="Amazon" onChange={(event) => update({ certifications: doc.certifications.map((item, i) => (i === index ? { ...item, issuer: event.target.value } : item)) })} className={`${inputClass} hidden sm:block`} />
              <input value={cert.year} aria-label="Année" placeholder="2025" maxLength={4} onChange={(event) => update({ certifications: doc.certifications.map((item, i) => (i === index ? { ...item, year: event.target.value } : item)) })} className={`${inputClass} hidden sm:block`} />
              <button type="button" aria-label="Retirer la certification" onClick={() => update({ certifications: doc.certifications.filter((_, i) => i !== index) })} className="px-2 text-sage hover:text-red-700">
                ×
              </button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => update({ certifications: [...doc.certifications, { name: "", issuer: "", year: "" }] })} className="mt-3 text-sm font-semibold text-forest hover:underline">
          + Ajouter une certification
        </button>
      </Card>
    </div>
  );
}

/* ============ 7. Projets ============ */

function ProjectCard({ project, ctx, open, onToggle }: { project: Project; ctx: StudioCtx; open: boolean; onToggle: () => void }) {
  const { doc, update } = ctx;
  const patch = (changes: Partial<Project>) => update({ projects: doc.projects.map((item) => (item.key === project.key ? { ...item, ...changes } : item)) });
  return (
    <li className="rounded-2xl border border-line bg-white">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 p-4 text-left">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{project.name || "Nouveau projet"}</span>
          <span className="block truncate text-sm text-sage">{project.url || "À renseigner"}</span>
        </span>
        <SaveHint complete={project.name.trim().length >= 2} what="le nom du projet" />
        <span className={`text-sage transition-transform ${open ? "rotate-180" : ""}`} aria-hidden>
          ⌄
        </span>
      </button>
      {open ? (
        <div className="space-y-4 border-t border-line p-4">
          <TextField label="Nom du projet" value={project.name} onChange={(event) => patch({ name: event.target.value })} placeholder="Moteur de matching sémantique" />
          <TextField label="Lien (facultatif)" value={project.url} onChange={(event) => patch({ url: event.target.value })} placeholder="github.com/vous/projet" />
          <AreaField label="Ce que vous avez fait (une ligne par point)" rows={4} value={project.description} onChange={(event) => patch({ description: event.target.value })} />
          <div className="flex justify-end">
            <RemoveButton onConfirm={() => ctx.removeItem("proj", project.key)} label="Supprimer ce projet" />
          </div>
        </div>
      ) : null}
    </li>
  );
}

export function StepProjets({ ctx }: { ctx: StudioCtx }) {
  const { doc, update } = ctx;
  const [openKey, setOpenKey] = useState<string | null>(doc.projects[0]?.key ?? null);
  return (
    <div>
      <StepHeader title="Vos projets" intro="Facultatif, mais précieux si vous débutez : projets personnels, open source, associations, hackathons." />
      <ul className="space-y-3">
        {doc.projects.map((project) => (
          <ProjectCard key={project.key} project={project} ctx={ctx} open={openKey === project.key} onToggle={() => setOpenKey(openKey === project.key ? null : project.key)} />
        ))}
      </ul>
      <button
        type="button"
        onClick={() => {
          const project = emptyProject();
          update({ projects: [project, ...doc.projects] });
          setOpenKey(project.key);
        }}
        className="mt-4 rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-white transition active:scale-95"
      >
        + Ajouter un projet
      </button>
    </div>
  );
}

/* ============ 8. Révision et export ============ */

export function StepExport({
  ctx,
  score,
  checks,
  pages,
  onPrint,
  onPublish,
  onCopy,
  publish,
}: {
  ctx: StudioCtx;
  score: number;
  checks: Check[];
  pages: number | null;
  onPrint: () => void;
  onPublish: () => void;
  onCopy: () => void;
  publish: { state: "idle" | "working" | "done" | "error"; message: string };
}) {
  const { doc, jobs, go } = ctx;
  const target = jobs.find((job) => job.id === doc.targetJobId);
  const coverage = target ? keywordCoverage(doc, target.requiredSkills) : null;
  const tone = score >= 80 ? "text-good" : score >= 55 ? "text-forest" : "text-warn";
  const todo = checks.filter((item) => item.status !== "ok").sort((a, b) => b.max - b.points - (a.max - a.points));
  const circumference = 2 * Math.PI * 44;

  return (
    <div>
      <StepHeader title="Révision et export" intro="Voici comment votre CV est lu. Corrigez les points orange, puis téléchargez-le ou publiez-le sur votre profil." />

      <Card className="flex items-center gap-5">
        <div className={`relative h-28 w-28 shrink-0 ${tone}`} role="img" aria-label={`Score ${score} sur 100`}>
          <svg viewBox="0 0 100 100" className="-rotate-90">
            <circle cx="50" cy="50" r="44" fill="none" strokeWidth="9" className="stroke-line" />
            <circle
              cx="50"
              cy="50"
              r="44"
              fill="none"
              strokeWidth="9"
              strokeLinecap="round"
              stroke="currentColor"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - score / 100)}
              style={{ transition: "stroke-dashoffset 700ms cubic-bezier(0.22,1,0.36,1)" }}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-3xl font-bold text-ink">{score}</span>
        </div>
        <div className="min-w-0">
          <p className="text-lg font-semibold">{score >= 80 ? "CV solide" : score >= 55 ? "Bon début" : "À étoffer"}</p>
          <p className="mt-1 text-sm leading-6 text-sage">
            {pages ? `Environ ${pages} page${pages > 1 ? "s" : ""}. ` : ""}
            {todo.length ? `${todo.length} point${todo.length > 1 ? "s" : ""} à améliorer.` : "Tout est en ordre."}
          </p>
        </div>
      </Card>

      {todo.length > 0 ? (
        <Card className="mt-4">
          <p className="font-semibold">À améliorer en priorité</p>
          <ul className="mt-3 divide-y divide-line">
            {todo.slice(0, 6).map((item) => (
              <li key={item.id} className="flex items-center gap-3 py-2.5">
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${item.status === "missing" ? "bg-red-100 text-red-700" : "bg-amber-100 text-warn"}`}>!</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{item.label}</span>
                  <span className="block text-xs text-sage">{item.detail}</span>
                </span>
                <button type="button" onClick={() => go(item.step)} className="shrink-0 rounded-full border border-forest px-3 py-1 text-xs font-semibold text-forest hover:bg-tint active:scale-95">
                  Corriger
                </button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {target && coverage ? (
        <Card className="mt-4">
          <div className="flex items-baseline justify-between">
            <p className="font-semibold">Adéquation avec « {target.title} »</p>
            <span className="text-sm font-semibold">{coverage.coverage} %</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-forest transition-all duration-700" style={{ width: `${coverage.coverage}%` }} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {coverage.matched.map((skill) => (
              <Chip key={skill} tone="good">
                ✓ {skill}
              </Chip>
            ))}
            {coverage.missing.map((skill) => (
              <Chip key={skill} tone="warn">
                + {skill}
              </Chip>
            ))}
          </div>
          {coverage.missing.length ? (
            <p className="mt-2 text-xs text-sage">
              Les mots-clés en orange n&apos;apparaissent pas dans votre CV. Ajoutez-les seulement s&apos;ils correspondent à une expérience réelle.
            </p>
          ) : null}
        </Card>
      ) : null}

      <Card className="mt-4">
        <p className="font-semibold">Exporter</p>
        <div className="mt-3 flex flex-wrap gap-3">
          <button type="button" onClick={onPrint} className="rounded-full bg-forest px-6 py-2.5 text-sm font-semibold text-white transition active:scale-95">
            Télécharger en PDF
          </button>
          <button type="button" onClick={onCopy} className="rounded-full border border-forest px-6 py-2.5 text-sm font-semibold text-forest transition hover:bg-tint active:scale-95">
            Copier le texte
          </button>
        </div>
        <p className="mt-2 text-xs leading-5 text-sage">
          Dans la fenêtre d&apos;impression, choisissez « Enregistrer au format PDF ». Désactivez « En-têtes et pieds de page » pour un rendu propre.
        </p>
      </Card>

      <Card className="mt-4">
        <p className="font-semibold">Publier sur mon profil</p>
        <p className="mt-1 text-sm leading-6 text-sage">
          Ce CV devient celui que les recruteurs voient dans la CVthèque et celui qui sert à l&apos;analyse ATS et au matching. Vos expériences et formations ne sont pas modifiées.
        </p>
        <button
          type="button"
          onClick={onPublish}
          disabled={publish.state === "working"}
          className="mt-3 rounded-full border border-forest px-6 py-2.5 text-sm font-semibold text-forest transition hover:bg-tint active:scale-95 disabled:opacity-60"
        >
          {publish.state === "working" ? "Publication…" : "Publier ce CV"}
        </button>
        {publish.message ? <p className={`mt-2 text-sm font-medium ${publish.state === "error" ? "text-red-700" : "text-good"}`}>{publish.message}</p> : null}
      </Card>

      <p className="mt-4 text-center text-xs text-sage">
        {fullName(doc)} · modèle {TEMPLATES.find((template) => template.id === doc.template)?.name.toLowerCase()}
      </p>
    </div>
  );
}
