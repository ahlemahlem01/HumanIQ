/**
 * Writing help for the CV Studio.
 *
 * House rule (same as the rest of the AI code): never invent anything. These helpers only
 * reorganise facts the candidate already entered, and point out what is weak so they can fix it.
 */

export type SummaryInput = {
  headline?: string;
  years?: number;
  skills?: string[];
  lastRole?: { title?: string; company?: string } | null;
  targetTitle?: string;
};

const clean = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export function localSummaries(input: SummaryInput): string[] {
  const headline = clean(input.headline);
  const years = Number.isFinite(input.years) && (input.years ?? 0) > 0 ? Math.round(input.years as number) : 0;
  const skills = (input.skills ?? []).map(clean).filter(Boolean).slice(0, 6);
  const role = input.lastRole && clean(input.lastRole.title) ? input.lastRole : null;
  const target = clean(input.targetTitle);

  const who = headline || (role ? clean(role.title) : "Professionnel");
  const experience = years ? `${years} an${years > 1 ? "s" : ""} d'expérience` : "";
  const skillLine = skills.length ? `Compétences clés : ${skills.join(", ")}.` : "";
  const roleLine = role
    ? clean(role.company)
      ? `Dernière expérience : ${clean(role.title)} chez ${clean(role.company)}.`
      : `Dernière expérience : ${clean(role.title)}.`
    : "";

  const variants: string[] = [];

  // 1. Factual: who, how long, what with, where
  variants.push([`${who}${experience ? ` avec ${experience}` : ""}.`, skillLine, roleLine].filter(Boolean).join(" "));

  // 2. Skills first (what ATS parsers read first)
  if (skills.length) {
    variants.push(
      [`Expertise en ${skills.slice(0, 3).join(", ")}${skills.length > 3 ? ` et ${skills[3]}` : ""}.`, `${who}${experience ? `, ${experience}` : ""}.`, roleLine]
        .filter(Boolean)
        .join(" "),
    );
  }

  // 3. Aimed at a job, using only the candidate's own facts
  if (target) {
    variants.push(
      [`${who}${experience ? ` (${experience})` : ""}, à la recherche d'un poste de ${target}.`, skillLine, roleLine]
        .filter(Boolean)
        .join(" "),
    );
  }

  return variants.filter((value, index, all) => value.length > 20 && all.indexOf(value) === index).slice(0, 3);
}

export const SUMMARY_TIPS = [
  "Visez 40 à 70 mots : assez pour situer votre profil, assez court pour être lu en entier.",
  "Citez 3 à 5 compétences qui figurent aussi dans l'offre visée.",
  "Évitez les adjectifs vagues (« motivé », « dynamique ») : préférez un fait.",
];

const ACTION_VERBS = [
  "conçu", "développé", "déployé", "dirigé", "piloté", "réalisé", "mis en place", "optimisé", "automatisé", "migré", "créé", "livré", "animé",
  "structuré", "réduit", "amélioré", "augmenté", "coordonné", "intégré", "refactorisé", "analysé", "formé", "rédigé", "mesuré", "lancé", "géré",
  "construit", "maintenu", "sécurisé", "industrialisé", "accompagné", "audité", "implémenté",
];

export const VERB_STARTERS = ["Conçu", "Développé", "Déployé", "Piloté", "Optimisé", "Automatisé", "Mis en place", "Réduit", "Livré", "Migré"];

export type BulletLine = {
  text: string;
  issues: { code: "first-person" | "no-verb" | "no-number" | "too-long" | "too-short" | "trailing-period"; message: string }[];
  /** Mechanical clean-up only (case, first person, final period). Never adds facts. */
  suggestion: string | null;
};

const FIRST_PERSON = /^(j['’]ai\s+|je\s+|j['’]étais\s+|nous avons\s+)/i;

export function analyzeBullets(raw: string): BulletLine[] {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.replace(/^[\s•\-–—*·▪◦]+/, "").trim())
    .filter(Boolean)
    .slice(0, 12);

  return lines.map((original) => {
    const issues: BulletLine["issues"] = [];
    let line = original;

    if (FIRST_PERSON.test(line)) {
      issues.push({ code: "first-person", message: "Évitez « je » / « j'ai » : commencez directement par le verbe." });
      line = line.replace(FIRST_PERSON, "");
    }
    if (/[.;]$/.test(line)) {
      issues.push({ code: "trailing-period", message: "Pas de point final dans une liste de réalisations." });
      line = line.replace(/[.;]+$/, "");
    }
    const first = line.split(/\s+/)[0]?.toLowerCase().replace(/[^a-zà-ÿ]/g, "") ?? "";
    const startsWithVerb = ACTION_VERBS.some((verb) => line.toLowerCase().startsWith(verb)) || /(é|és|ée|ées|ant)$/.test(first);
    if (!startsWithVerb) {
      issues.push({ code: "no-verb", message: "Commencez par un verbe d'action (Conçu, Développé, Piloté…)." });
    }
    if (!/\d/.test(line)) {
      issues.push({ code: "no-number", message: "Ajoutez un chiffre si vous en avez un (volume, durée, % d'amélioration, taille d'équipe)." });
    }
    if (line.length > 220) issues.push({ code: "too-long", message: "Trop long : visez une ou deux lignes." });
    if (line.length < 25) issues.push({ code: "too-short", message: "Trop court : précisez le contexte ou le résultat." });

    const suggestion = line ? line.charAt(0).toUpperCase() + line.slice(1) : null;
    return { text: original, issues, suggestion: suggestion && suggestion !== original ? suggestion : null };
  });
}

export const BULLET_TIPS = [
  "Une puce = un verbe d'action + ce que vous avez fait + le résultat.",
  "Un chiffre vaut mieux qu'un adjectif : « -30 % de temps de build » plutôt que « build plus rapide ».",
  "Mettez en premier la réalisation la plus proche de l'offre visée.",
];
