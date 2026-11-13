"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type StepId = "choice" | "context" | "title" | "skills" | "mission" | "terms" | "review";
type Mode = "ai" | "manual";
type Draft = {
  title: string;
  description: string;
  location: string;
  contractType: string;
  remote: boolean;
  skills: string[];
  currency: string;
  salaryMin: number | null;
  salaryMax: number | null;
  source: "model" | "draft";
};

const SEQUENCE: Record<Mode, StepId[]> = {
  ai: ["choice", "context", "title", "skills", "mission", "terms", "review"],
  manual: ["choice", "title", "skills", "mission", "terms", "review"],
};

export default function RecruiterJobsPage() {
  const { token } = useAuth();
  const [step, setStep] = useState<StepId>("choice");
  const [mode, setMode] = useState<Mode | null>(null);
  const [company, setCompany] = useState("");
  const [context, setContext] = useState("");
  const [brief, setBrief] = useState("");
  const [title, setTitle] = useState("");
  const [skills, setSkills] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [contractType, setContractType] = useState("CDI");
  const [remote, setRemote] = useState(false);
  const [currency, setCurrency] = useState("TND");
  const [salaryMin, setSalaryMin] = useState("");
  const [salaryMax, setSalaryMax] = useState("");
  const [source, setSource] = useState<Draft["source"] | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [createdId, setCreatedId] = useState("");

  useEffect(() => {
    if (!token) return;
    api<{ company: { name: string }; location: string | null }>("/recruiters/me", { token })
      .then((me) => {
        setCompany(me.company.name);
        setLocation((current) => current || me.location || "");
      })
      .catch(() => undefined);
  }, [token]);

  const sequence = SEQUENCE[mode ?? "manual"];
  const index = Math.max(sequence.indexOf(step), 0);

  function go(next: StepId) {
    setError("");
    setStep(next);
  }

  function back() {
    const previous = sequence[index - 1];
    if (previous) go(previous);
  }

  function applyDraft(draft: Draft) {
    setTitle(draft.title);
    setDescription(draft.description);
    setLocation(draft.location);
    setContractType(draft.contractType);
    setRemote(draft.remote);
    setSkills(draft.skills.join(", "));
    setCurrency(draft.currency || "TND");
    setSalaryMin(draft.salaryMin ? String(draft.salaryMin) : "");
    setSalaryMax(draft.salaryMax ? String(draft.salaryMax) : "");
    setSource(draft.source);
  }

  async function prepareDraft() {
    if (!token) return;
    if (brief.trim().length < 20) {
      setError("Décrivez le poste un peu plus longuement.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const draft = await api<Draft>("/ai/job-draft", { token, body: { context, brief } });
      applyDraft(draft);
      go("title");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Le brouillon n'a pas pu être préparé.");
    } finally {
      setPending(false);
    }
  }

  async function rewriteOffer() {
    if (!token) return;
    const text = brief.trim().length >= 20 ? brief.trim() : `${title} ${skills}`.trim();
    if (text.length < 20) {
      setError("Décrivez le poste avant de réécrire.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const draft = await api<Draft>("/ai/job-draft", { token, body: { context, brief: text } });
      setTitle(draft.title);
      setDescription(draft.description);
      if (draft.skills.length) setSkills(draft.skills.join(", "));
      setSource(draft.source);
    } catch (err) {
      setError(err instanceof Error ? err.message : "L'offre n'a pas pu être réécrite.");
    } finally {
      setPending(false);
    }
  }

  async function publish(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    const min = Number(salaryMin) || undefined;
    const max = Number(salaryMax) || undefined;
    const requiredSkills = skills
      .split(",")
      .map((skill) => skill.trim())
      .filter(Boolean);
    if (title.trim().length < 3 || description.trim().length < 20 || !location.trim() || requiredSkills.length === 0) {
      setError("Le titre, le lieu, la mission et au moins une compétence sont nécessaires.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const job = await api<{ id: string }>("/jobs", {
        token,
        body: {
          title: title.trim(),
          description: description.trim(),
          location: location.trim(),
          remote,
          contractType,
          currency,
          salaryMin: currency === "TND" && min ? min * 12 : min,
          salaryMax: currency === "TND" && max ? max * 12 : max,
          requiredSkills,
          status: "PUBLISHED",
        },
      });
      setCreatedId(job.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publication impossible.");
    } finally {
      setPending(false);
    }
  }

  const skillList = skills
    .split(",")
    .map((skill) => skill.trim())
    .filter(Boolean);

  return (
    <AppShell role="RECRUITER" plain>
      <div className="mx-auto grid max-w-[1100px] grid-cols-[minmax(0,1fr)] items-start gap-8 pb-8 lg:grid-cols-[220px_minmax(0,1fr)]">
        <StepRail sequence={sequence} index={index} />
        <div className="min-w-0 rounded-2xl border border-line bg-white p-6 md:p-10">

        {step === "choice" ? (
          <section>
            <h1 className="text-3xl font-semibold tracking-tight">Comment rédiger l&apos;offre ?</h1>
            <p className="mt-3 max-w-xl text-base leading-7 text-sage">
              Tout reste modifiable avant la publication.{company ? ` L'offre sera chez ${company}.` : ""}
            </p>
            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  setMode("ai");
                  go("context");
                }}
                className="rounded-2xl bg-forest px-6 py-7 text-left text-white transition hover:bg-forest-dark"
              >
                <span className="text-xs text-white/70">Le plus rapide</span>
                <span className="mt-3 block text-2xl font-semibold tracking-tight">Avec l&apos;IA</span>
                <span className="mt-2 block text-sm leading-6 text-white/80">
                  Quelques phrases sur l&apos;équipe et le poste. Un brouillon est préparé, vous le corrigez.
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("manual");
                  setSource(null);
                  go("title");
                }}
                className="rounded-2xl border border-line bg-white px-6 py-7 text-left transition hover:border-forest"
              >
                <span className="text-xs text-sage">À la main</span>
                <span className="mt-3 block text-2xl font-semibold tracking-tight">Sans l&apos;IA</span>
                <span className="mt-2 block text-sm leading-6 text-sage">
                  Titre, mission, compétences et cadre, écrits par vous.
                </span>
              </button>
            </div>
          </section>
        ) : null}

        {step === "context" ? (
          <section>
            <h1 className="text-3xl font-semibold tracking-tight">Ajouter le contexte</h1>
            <p className="mt-3 max-w-xl text-base leading-7 text-sage">
              Ces notes préparent le brouillon. Elles ne sont pas publiées.
            </p>
            {company ? <p className="mt-4 text-sm font-semibold">{company}</p> : null}
            <div className="mt-8 grid gap-4">
              <label className="rounded-xl border border-line bg-white px-5 py-5 focus-within:border-forest focus-within:ring-4 focus-within:ring-forest/10">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="text-base font-semibold">L&apos;équipe</span>
                  <span className="text-xs text-sage">Facultatif</span>
                </span>
                <span className="mt-1 block text-sm text-sage">Où elle travaille, et ce qu&apos;elle fait.</span>
                <WritingField
                  bare
                  value={context}
                  onChange={setContext}
                  maxLength={2000}
                  placeholder="Équipe produit à Ariana. Stages PFE et premiers CDI."
                />
              </label>
              <label className="rounded-xl border border-line bg-white px-5 py-5 focus-within:border-forest focus-within:ring-4 focus-within:ring-forest/10">
                <span className="block text-base font-semibold">Le poste</span>
                <span className="mt-1 block text-sm text-sage">Qui vous cherchez, en quelques phrases.</span>
                <WritingField
                  bare
                  value={brief}
                  onChange={setBrief}
                  maxLength={2000}
                  placeholder="Un développeur Flutter, stage de six mois, télétravail partiel, à Ariana."
                />
              </label>
            </div>
            {error ? <p className="mt-3 text-sm text-warn">{error}</p> : null}
            <Footer
              onBack={back}
              pending={pending}
              nextLabel={pending ? "Préparation…" : "Préparer le brouillon"}
              onNext={prepareDraft}
            />
          </section>
        ) : null}

        {step === "title" ? (
          <section>
            <h1 className="text-3xl font-semibold tracking-tight">Titre de l&apos;offre</h1>
            <p className="mt-3 text-base text-sage">Le métier, pas une phrase entière.</p>
            {source ? <DraftNote source={source} /> : null}
            <label className="relative mt-8 block">
              <span className="sr-only">Titre de l&apos;offre</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Développeur Flutter"
                className="w-full cursor-text rounded-xl border border-line bg-white px-4 py-3 pr-12 text-2xl font-semibold tracking-tight outline-none transition placeholder:text-sage/70 focus:border-forest focus:ring-4 focus:ring-forest/10"
              />
              <svg viewBox="0 0 24 24" className="pointer-events-none absolute bottom-4 right-4 h-5 w-5 text-sage" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
                <path d="M4 20h4l10-10-4-4L4 16v4Zm9-13 4 4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </label>
            <Footer onBack={back} nextLabel="Continuer" onNext={() => (title.trim().length >= 3 ? go("skills") : setError("Indiquez un titre d'au moins 3 caractères."))} />
            {error ? <p className="mt-3 text-sm text-warn">{error}</p> : null}
          </section>
        ) : null}

        {step === "skills" ? (
          <section>
            <h1 className="text-3xl font-semibold tracking-tight">Compétences</h1>
            <p className="mt-3 text-base text-sage">Celles que la personne doit vraiment avoir.</p>
            <SkillField value={skills} onChange={setSkills} />
            <Footer
              onBack={back}
              nextLabel="Continuer"
              onNext={() =>
                skills.split(",").some((skill) => skill.trim())
                  ? go("mission")
                  : setError("Ajoutez au moins une compétence.")
              }
            />
            {error ? <p className="mt-3 text-sm text-warn">{error}</p> : null}
          </section>
        ) : null}

        {step === "mission" ? (
          <section>
            <h1 className="text-3xl font-semibold tracking-tight">Mission</h1>
            <p className="mt-3 text-base text-sage">Ce que la personne fera, avec qui, et ce que vous attendez.</p>
            <label className="relative mt-8 block rounded-xl border border-line bg-white px-5 py-5 focus-within:border-forest focus-within:ring-4 focus-within:ring-forest/10">
              <WritingField
                bare
                pen
                value={description}
                onChange={setDescription}
                placeholder="Elle construira l'application mobile avec l'équipe produit, à Ariana."
              />
              <svg viewBox="0 0 24 24" className="pointer-events-none absolute bottom-7 right-5 h-5 w-5 text-sage" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
                <path d="M4 20h4l10-10-4-4L4 16v4Zm9-13 4 4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </label>
            <Footer
              onBack={back}
              nextLabel="Continuer"
              onNext={() =>
                description.trim().length >= 20 ? go("terms") : setError("La mission doit faire au moins 20 caractères.")
              }
            />
            {error ? <p className="mt-3 text-sm text-warn">{error}</p> : null}
          </section>
        ) : null}

        {step === "terms" ? (
          <section>
            <h1 className="text-3xl font-semibold tracking-tight">Cadre</h1>
            <p className="mt-3 text-base text-sage">Le salaire en dinars est un brut mensuel. Il peut rester vide.</p>
            <input
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="Ariana"
              className="mt-8 w-full rounded-xl border border-line bg-white px-4 py-3 text-xl font-semibold outline-none transition placeholder:text-sage/50 focus:border-forest focus:ring-4 focus:ring-forest/10"
            />
            <div className="mt-8 flex flex-wrap gap-2">
              {["CDI", "CDD", "Stage", "Freelance"].map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setContractType(item)}
                  className={`rounded-full px-4 py-2 text-sm font-medium ${
                    contractType === item ? "border border-forest bg-forest text-white" : "border border-line bg-white text-ink hover:border-forest"
                  }`}
                >
                  {item}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setRemote((value) => !value)}
                className={`rounded-full px-4 py-2 text-sm ${remote ? "border border-forest bg-forest text-white" : "border border-line bg-white text-ink hover:border-forest"}`}
              >
                Télétravail
              </button>
            </div>
            <div className="mt-8 flex flex-wrap items-end gap-3">
              <input
                value={salaryMin}
                onChange={(event) => setSalaryMin(event.target.value)}
                type="number"
                min={0}
                placeholder="1800"
                className="w-32 rounded-xl border border-line bg-white px-4 py-3 text-xl font-semibold outline-none transition placeholder:text-sage/50 focus:border-forest focus:ring-4 focus:ring-forest/10"
              />
              <span className="pb-1 text-2xl text-sage">–</span>
              <input
                value={salaryMax}
                onChange={(event) => setSalaryMax(event.target.value)}
                type="number"
                min={0}
                placeholder="2800"
                className="w-32 rounded-xl border border-line bg-white px-4 py-3 text-xl font-semibold outline-none transition placeholder:text-sage/50 focus:border-forest focus:ring-4 focus:ring-forest/10"
              />
              <div className="mb-1 flex gap-2">
                {(["TND", "EUR"] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setCurrency(item)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${currency === item ? "border-forest bg-forest text-white" : "border-line bg-white text-sage hover:border-forest"}`}
                  >
                    {item === "TND" ? "DT / mois" : "€ / an"}
                  </button>
                ))}
              </div>
            </div>
            <Footer onBack={back} nextLabel="Relire l'offre" onNext={() => (location.trim() ? go("review") : setError("Indiquez un lieu."))} />
            {error ? <p className="mt-3 text-sm text-warn">{error}</p> : null}
          </section>
        ) : null}

        {step === "review" ? (
          <section>
            <h1 className="text-3xl font-semibold tracking-tight">{createdId ? "Offre publiée" : "Relire"}</h1>
            <p className="mt-3 text-base text-sage">
              {createdId ? "Les candidats peuvent maintenant la trouver." : "Voici l'offre telle qu'elle sera publiée."}
            </p>
            {!createdId && mode === "ai" ? (
              <button
                type="button"
                onClick={rewriteOffer}
                disabled={pending}
                className="mt-6 rounded-full border border-forest px-5 py-2 text-sm font-semibold text-forest hover:bg-tint disabled:opacity-60"
              >
                {pending ? "Rédaction…" : "Réécrire l'offre"}
              </button>
            ) : null}
            {createdId ? (
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href={`/recruteur/pipeline/${createdId}`} className="inline-block rounded-full bg-forest px-6 py-2.5 text-sm font-semibold text-white">
                  Voir les candidatures
                </Link>
                <Link href="/recruteur/offres" className="inline-block rounded-full border border-forest px-6 py-2.5 text-sm font-semibold text-forest hover:bg-tint">
                  Mes offres
                </Link>
              </div>
            ) : (
              <form onSubmit={publish} className="mt-10">
                <article className="rounded-xl border border-line bg-paper p-6">
                  <p className="text-sm text-sage">
                    {company || "Entreprise"} · {contractType}
                    {location ? ` · ${location}` : ""}
                    {remote ? " · Télétravail" : ""}
                    {payLine(currency, salaryMin, salaryMax)}
                  </p>
                  <h2 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h2>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {skillList.map((skill) => (
                      <span key={skill} className="rounded-full border border-line bg-white px-3 py-1 text-sm">
                        {skill}
                      </span>
                    ))}
                  </div>
                  <p className="mt-6 whitespace-pre-wrap text-base leading-7">{description}</p>
                </article>
                <div className="mt-6 flex flex-wrap gap-4 text-sm text-sage">
                  <button type="button" onClick={() => go("title")} className="hover:text-forest">Titre</button>
                  <button type="button" onClick={() => go("skills")} className="hover:text-forest">Compétences</button>
                  <button type="button" onClick={() => go("mission")} className="hover:text-forest">Mission</button>
                  <button type="button" onClick={() => go("terms")} className="hover:text-forest">Cadre</button>
                </div>
                {error ? <p className="mt-4 text-sm text-warn">{error}</p> : null}
                <div className="mt-10 flex items-center justify-between gap-3">
                  <button type="button" onClick={back} className="text-sm font-semibold text-sage hover:text-ink">
                    Retour
                  </button>
                  <button disabled={pending} className="rounded-full bg-forest px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
                    {pending ? "Publication…" : "Publier"}
                  </button>
                </div>
              </form>
            )}
          </section>
        ) : null}
        </div>
      </div>
    </AppShell>
  );
}

function WritingField({
  value,
  onChange,
  placeholder,
  maxLength,
  bare = false,
  pen = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  maxLength?: number;
  bare?: boolean;
  pen?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const field = ref.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${Math.max(field.scrollHeight, bare ? 72 : 112)}px`;
  }, [value, bare]);

  return (
    <textarea
      ref={ref}
      value={value}
      maxLength={maxLength}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      rows={bare ? 2 : 3}
      className={
        pen
          ? "w-full cursor-text resize-none overflow-hidden border-b border-line bg-transparent py-2 pr-8 text-base leading-7 outline-none transition-colors placeholder:text-sage/70 focus:border-forest"
          : bare
            ? "mt-3 w-full resize-none overflow-hidden bg-transparent text-base leading-7 outline-none placeholder:text-sage"
            : "mt-3 w-full resize-none overflow-hidden border-b border-line bg-transparent py-3 text-xl leading-8 outline-none transition-colors placeholder:text-sage/70 focus:border-forest"
      }
    />
  );
}

function payLine(currency: string, min: string, max: string) {
  if (!min && !max) return "";
  const unit = currency === "TND" ? "DT / mois" : "€ / an";
  if (min && max) return ` · ${min}–${max} ${unit}`;
  return ` · ${min || max} ${unit}`;
}

function DraftNote({ source }: { source: Draft["source"] }) {
  return (
    <p className="mt-4 text-sm text-sage">
      {source === "model"
        ? "Brouillon proposé. Corrigez-le avant de publier."
        : "Brouillon préparé à partir de votre texte. Corrigez-le avant de publier."}
    </p>
  );
}

const STEP_LABEL: Record<StepId, string> = {
  choice: "Mode de rédaction",
  context: "Contexte",
  title: "Titre",
  skills: "Compétences",
  mission: "Mission",
  terms: "Cadre et salaire",
  review: "Relecture",
};

function StepRail({ sequence, index }: { sequence: StepId[]; index: number }) {
  return (
    <nav aria-label="Étapes" className="lg:sticky lg:top-20">
      <p className="text-xs font-semibold uppercase tracking-widest text-sage">Publier une offre</p>
      <ol className="mt-4 flex gap-2 overflow-x-auto pb-1 lg:block lg:space-y-1 lg:overflow-visible">
        {sequence.map((id, position) => (
          <li
            key={id}
            className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm ${
              position === index ? "bg-tint font-semibold text-forest" : position < index ? "text-ink" : "text-sage"
            }`}
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                position < index
                  ? "bg-forest text-white"
                  : position === index
                    ? "border-2 border-forest text-forest"
                    : "border border-line"
              }`}
            >
              {position < index ? "✓" : position + 1}
            </span>
            {STEP_LABEL[id]}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function SkillField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [draft, setDraft] = useState("");
  const list = value
    .split(",")
    .map((skill) => skill.trim())
    .filter(Boolean)
    // The AI draft can contain the same skill twice: keep the first occurrence (keys must be unique).
    .filter((skill, index, all) => all.findIndex((other) => other.toLowerCase() === skill.toLowerCase()) === index);

  function commit(raw: string) {
    const next = raw.trim().replace(/,$/, "");
    if (!next || list.some((skill) => skill.toLowerCase() === next.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...list, next].join(", "));
    setDraft("");
  }

  function remove(skill: string) {
    onChange(list.filter((item) => item !== skill).join(", "));
  }

  return (
    <div className="mt-8 rounded-xl border border-line bg-white px-5 py-5 focus-within:border-forest focus-within:ring-4 focus-within:ring-forest/10">
      {list.length ? (
        <div className="flex flex-wrap gap-2">
          {list.map((skill) => (
            <span key={skill} className="inline-flex items-center gap-2 rounded-full border border-line bg-paper px-3 py-1.5 text-sm">
              {skill}
              <button type="button" onClick={() => remove(skill)} aria-label={`Retirer ${skill}`} className="text-sage">
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <input
        value={draft}
        onChange={(event) => {
          const typed = event.target.value;
          if (typed.includes(",")) commit(typed);
          else setDraft(typed);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit(draft);
          }
          if (event.key === "Backspace" && !draft && list.length) remove(list[list.length - 1]);
        }}
        placeholder="Ajouter une compétence"
        aria-label="Ajouter une compétence"
        className="mt-4 w-full border-b border-line bg-transparent py-2 text-xl outline-none placeholder:text-sage/70 focus:border-forest"
      />
    </div>
  );
}

function Footer({
  onBack,
  onNext,
  nextLabel,
  pending = false,
}: {
  onBack: () => void;
  onNext: () => void;
  nextLabel: string;
  pending?: boolean;
}) {
  return (
    <div className="mt-12 flex items-center justify-between gap-3">
      <button type="button" onClick={onBack} className="text-sm font-semibold text-sage hover:text-ink">
        Retour
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={onNext}
        className="rounded-full bg-forest px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {nextLabel}
      </button>
    </div>
  );
}

