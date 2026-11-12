import { bulletLines, contactItems, wordCount, type CvDoc } from "./types";

export type StepId = "modele" | "identite" | "resume" | "experience" | "formation" | "competences" | "projets" | "export";

export type Check = {
  id: string;
  label: string;
  status: "ok" | "warn" | "missing";
  detail: string;
  points: number;
  max: number;
  step: StepId;
};

export const ACTION_START =
  /^(conçu|concu|développé|developpé|developpe|déployé|deploye|dirigé|dirige|piloté|pilote|réalisé|realise|mis en place|optimisé|optimise|automatisé|automatise|migré|migre|créé|cree|livré|livre|animé|anime|structuré|structure|réduit|reduit|amélioré|ameliore|augmenté|augmente|coordonné|coordonne|intégré|integre|analysé|analyse|formé|forme|rédigé|redige|lancé|lance|géré|gere|construit|maintenu|sécurisé|securise|industrialisé|industrialise|accompagné|accompagne|audité|audite|implémenté|implemente|participé|participe|assuré|assure|contribué|contribue)/i;

function check(id: string, label: string, step: StepId, max: number, points: number, detail: string): Check {
  const status = points >= max ? "ok" : points > 0 ? "warn" : "missing";
  return { id, label, status, detail, points, max, step };
}

/** Live quality score of the CV being written (not the same as the file audit of an uploaded CV). */
export function scoreDoc(doc: CvDoc, pages: number | null): { score: number; checks: Check[] } {
  const checks: Check[] = [];

  // Contact
  const hasName = (doc.displayName || `${doc.firstName}${doc.lastName}`).trim().length > 1;
  checks.push(
    check("email", "Nom et e-mail", "identite", 8, hasName && doc.email.trim() ? 8 : hasName || doc.email.trim() ? 4 : 0, "Le recruteur doit pouvoir vous écrire sans chercher."),
  );
  checks.push(check("phone", "Téléphone", "identite", 4, doc.phone.trim() ? 4 : 0, "Un numéro rassure et accélère la prise de contact."));
  checks.push(check("location", "Lieu", "identite", 4, doc.location.trim() ? 4 : 0, "Indiquez une ville ou « Remote »."));
  checks.push(
    check("links", "Lien professionnel", "identite", 3, [doc.linkedin, doc.website, doc.github].some((value) => value.trim()) ? 3 : 0, "LinkedIn, GitHub ou un portfolio."),
  );

  // Headline
  const headlineWords = wordCount(doc.headline);
  checks.push(
    check(
      "headline",
      "Titre professionnel",
      "identite",
      8,
      headlineWords >= 2 && headlineWords <= 12 ? 8 : headlineWords > 0 ? 4 : 0,
      headlineWords ? "Idéal : 2 à 12 mots, avec votre métier." : "Une ligne de métier sous votre nom.",
    ),
  );

  // Summary
  const summaryWords = wordCount(doc.summary);
  checks.push(
    check(
      "summary",
      "Résumé",
      "resume",
      10,
      summaryWords >= 30 && summaryWords <= 90 ? 10 : summaryWords > 0 ? 5 : 0,
      summaryWords ? `${summaryWords} mots (idéal : 40 à 70).` : "Trois ou quatre phrases qui situent votre profil.",
    ),
  );

  // Experience
  const roles = doc.experiences.filter((role) => role.title.trim() && role.company.trim());
  checks.push(check("experience", "Expériences", "experience", 12, roles.length >= 2 ? 12 : roles.length === 1 ? 7 : 0, `${roles.length} expérience${roles.length > 1 ? "s" : ""} renseignée${roles.length > 1 ? "s" : ""}.`));
  checks.push(check("dates", "Dates des expériences", "experience", 4, roles.length > 0 && roles.every((role) => role.start) ? 4 : 0, "Chaque poste doit avoir au moins une date de début."));

  const allBullets = roles.flatMap((role) => bulletLines(role.bullets));
  const wellFilled = roles.filter((role) => bulletLines(role.bullets).length >= 2).length;
  checks.push(
    check(
      "bullets",
      "Réalisations détaillées",
      "experience",
      10,
      roles.length === 0 ? 0 : Math.round((wellFilled / roles.length) * 10),
      "Au moins deux réalisations par expérience.",
    ),
  );
  const verbRatio = allBullets.length ? allBullets.filter((line) => ACTION_START.test(line)).length / allBullets.length : 0;
  checks.push(check("verbs", "Verbes d'action", "experience", 6, Math.round(verbRatio * 6), "Commencez chaque réalisation par un verbe : Conçu, Piloté, Optimisé…"));
  const numberRatio = allBullets.length ? allBullets.filter((line) => /\d/.test(line)).length / allBullets.length : 0;
  checks.push(check("numbers", "Résultats chiffrés", "experience", 6, Math.min(6, Math.round((numberRatio / 0.4) * 6)), "Visez un chiffre dans au moins une réalisation sur trois."));

  // Education
  checks.push(check("education", "Formation", "formation", 6, doc.educations.some((school) => school.school.trim()) ? 6 : 0, "Diplôme et établissement."));

  // Skills
  const skills = doc.skills.length;
  checks.push(
    check("skills", "Compétences", "competences", 10, skills >= 6 && skills <= 18 ? 10 : skills >= 3 ? 6 : skills > 0 ? 3 : 0, `${skills} compétence${skills > 1 ? "s" : ""} (idéal : 6 à 15).`),
  );

  // Length
  if (pages !== null) {
    checks.push(check("pages", "Longueur", "export", 4, pages <= 2 ? 4 : 1, pages <= 1 ? "1 page : idéal." : pages === 2 ? "2 pages : acceptable." : `${pages} pages : condensez.`));
  }

  const max = checks.reduce((total, item) => total + item.max, 0);
  const points = checks.reduce((total, item) => total + item.points, 0);
  return { score: max ? Math.round((points / max) * 100) : 0, checks };
}

/** How well the written CV covers the keywords of a target job. */
export function keywordCoverage(doc: CvDoc, requiredSkills: string[]) {
  const haystack = [
    doc.headline,
    doc.summary,
    doc.skills.join(" "),
    ...doc.experiences.flatMap((role) => [role.title, role.bullets]),
    ...doc.projects.map((project) => `${project.name} ${project.description}`),
  ]
    .join(" ")
    .toLowerCase();
  const matched = requiredSkills.filter((skill) => haystack.includes(skill.toLowerCase()));
  const missing = requiredSkills.filter((skill) => !haystack.includes(skill.toLowerCase()));
  return { matched, missing, coverage: requiredSkills.length ? Math.round((matched.length / requiredSkills.length) * 100) : 0 };
}

export { contactItems };
