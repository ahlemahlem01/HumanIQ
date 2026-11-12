import { parseCvProfile } from "./cv-profile";

export type AtsStatus = "ok" | "warn" | "missing";

export type AtsCheck = {
  id: string;
  label: string;
  status: AtsStatus;
  detail: string;
  points: number;
  max: number;
};

export function auditCvDocument(input: {
  cvText: string;
  fileName: string | null;
  mimeType: string | null;
  pageCount: number | null;
  headline: string | null;
  location: string | null;
  skills: string[];
}): { score: number; checks: AtsCheck[] } {
  const text = input.cvText.replace(/\r/g, "").trim();
  if (text.length < 80) {
    return {
      score: 0,
      checks: [
        check("document", "CV déposé", "missing", "Déposez un PDF ou un Word pour lancer l'analyse.", 0, 20),
      ],
    };
  }

  const parsed = parseCvProfile(text);
  const checks: AtsCheck[] = [];

  const fileOk = /pdf|word|officedocument/.test(input.mimeType ?? "") || /\.(pdf|docx)$/i.test(input.fileName ?? "");
  checks.push(
    fileOk
      ? check("format", "Format lisible", "ok", "PDF ou Word : les logiciels de recrutement lisent ce format.", 8, 8)
      : check("format", "Format lisible", "warn", "Préférez un PDF ou un Word. Le texte brut passe moins bien.", 4, 8),
  );

  checks.push(
    EMAIL.test(text)
      ? check("email", "E-mail dans le CV", "ok", "Une adresse est présente dans le document.", 10, 10)
      : check("email", "E-mail dans le CV", "missing", "Ajoutez votre e-mail en haut du CV, pas seulement sur le profil.", 0, 10),
  );

  checks.push(
    PHONE.test(text)
      ? check("phone", "Téléphone", "ok", "Un numéro est détecté.", 6, 6)
      : check("phone", "Téléphone", "warn", "Ajoutez un numéro si vous acceptez d'être appelé.", 3, 6),
  );

  const location = input.location || parsed.location;
  checks.push(
    location
      ? check("location", "Lieu", "ok", location, 6, 6)
      : check("location", "Lieu", "warn", "Indiquez une ville, ou « Remote ».", 2, 6),
  );

  const headline = input.headline || parsed.headline;
  checks.push(
    headline
      ? check("headline", "Titre", "ok", headline, 8, 8)
      : check("headline", "Titre", "missing", "Ajoutez une ligne de métier sous votre nom.", 0, 8),
  );

  const jobs = parsed.experiences.length;
  checks.push(
    jobs > 0
      ? check("experience", "Expérience", "ok", `${jobs} poste${jobs > 1 ? "s" : ""} reconnu${jobs > 1 ? "s" : ""}.`, 16, 16)
      : check("experience", "Expérience", "missing", "Ajoutez un titre « Expérience » puis chaque poste avec ses dates.", 0, 16),
  );

  const schools = parsed.educations.length;
  checks.push(
    schools > 0
      ? check("education", "Formation", "ok", `${schools} formation${schools > 1 ? "s" : ""} reconnue${schools > 1 ? "s" : ""}.`, 8, 8)
      : check("education", "Formation", "warn", "Ajoutez un titre « Formation » avec le diplôme et l'établissement.", 3, 8),
  );

  const skills = unique([...input.skills, ...parsed.skills]);
  checks.push(
    skills.length >= 5
      ? check("skills", "Compétences", "ok", `${skills.length} compétences repérées.`, 12, 12)
      : skills.length > 0
        ? check("skills", "Compétences", "warn", "Listez au moins cinq compétences dans une section dédiée.", 6, 12)
        : check("skills", "Compétences", "missing", "Ajoutez une section « Compétences » avec les mots du métier.", 0, 12),
  );

  const dated = parsed.experiences.filter((item) => item.startDate).length;
  checks.push(
    jobs > 0 && dated === jobs
      ? check("dates", "Dates", "ok", "Chaque poste a une période.", 8, 8)
      : jobs > 0
        ? check("dates", "Dates", "warn", "Certaines expériences n'ont pas de dates lisibles (mois année – mois année).", 4, 8)
        : check("dates", "Dates", "missing", "Les dates permettent de reconstituer le parcours.", 0, 8),
  );

  const bullets = (text.match(/^\s*(?:[-•*]|\d+\.)\s+\S/gm) ?? []).length;
  checks.push(
    bullets >= 3
      ? check("bullets", "Puces", "ok", `${bullets} puces. Un lecteur automatique les isole bien.`, 8, 8)
      : check("bullets", "Puces", "warn", "Décrivez les postes en puces courtes, une idée par ligne.", 3, 8),
  );

  const pages = input.pageCount ?? 0;
  const lengthOk = (pages >= 1 && pages <= 2) || (text.length >= 700 && text.length <= 6000);
  const lengthShort = text.length < 700 && pages !== 1 && pages !== 2;
  checks.push(
    lengthOk
      ? check("length", "Longueur", "ok", pages ? `${pages} page${pages > 1 ? "s" : ""}.` : "Longueur adaptée à une ou deux pages.", 8, 8)
      : lengthShort
        ? check("length", "Longueur", "warn", "Le CV est court. Ajoutez des résultats concrets sur les postes récents.", 4, 8)
        : check("length", "Longueur", "warn", "Au-delà de deux pages, gardez le plus récent et retirez le détail ancien.", 4, 8),
  );

  const max = checks.reduce((sum, item) => sum + item.max, 0);
  const earned = checks.reduce((sum, item) => sum + item.points, 0);
  return { score: Math.round((earned / max) * 100), checks };
}

function check(id: string, label: string, status: AtsStatus, detail: string, points: number, max: number): AtsCheck {
  return { id, label, status, detail, points, max };
}

function unique(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE = /(?:\+|00)?\d[\d\s().-]{8,}\d/;
