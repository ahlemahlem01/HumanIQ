/** Data model of the CV Studio, plus conversions from/to the candidate profile. */

export type Template = "classic" | "modern" | "compact";

export const SECTIONS = [
  { id: "summary", label: "Résumé" },
  { id: "skills", label: "Compétences" },
  { id: "experience", label: "Expérience" },
  { id: "projects", label: "Projets" },
  { id: "education", label: "Formation" },
  { id: "certifications", label: "Certifications" },
  { id: "languages", label: "Langues" },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];

export type Role = {
  key: string;
  id?: string;
  title: string;
  company: string;
  location: string;
  start: string; // YYYY-MM
  end: string; // YYYY-MM
  current: boolean;
  bullets: string; // one achievement per line
};

export type School = {
  key: string;
  id?: string;
  school: string;
  degree: string;
  field: string;
  start: string;
  end: string;
  bullets: string;
};

export type Project = {
  key: string;
  id?: string;
  name: string;
  url: string;
  description: string;
};

export type Language = { name: string; level: string };
export type Certification = { name: string; issuer: string; year: string };

export type CvDoc = {
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  website: string;
  github: string;
  headline: string;
  summary: string;
  skills: string[];
  experiences: Role[];
  educations: School[];
  projects: Project[];
  languages: Language[];
  certifications: Certification[];
  template: Template;
  accent: string;
  hiddenSections: SectionId[];
  targetJobId: string;
};

export const ACCENTS = ["#1a3585", "#0e7490", "#15803d", "#b45309", "#9f1239", "#111827"];

/* ---------- server payloads ---------- */

type ServerExperience = {
  id: string;
  title: string;
  company: string;
  location: string | null;
  startDate: string;
  endDate: string | null;
  current: boolean;
  description: string | null;
};
type ServerEducation = {
  id: string;
  school: string;
  degree: string | null;
  field: string | null;
  startDate: string | null;
  endDate: string | null;
  description: string | null;
};
type ServerProject = {
  id: string;
  name: string;
  url: string | null;
  description: string | null;
};

export type ServerProfile = {
  headline: string | null;
  bio: string | null;
  location: string | null;
  linkedinUrl: string | null;
  skills: string[];
  cvSettings?: {
    template?: string;
    accent?: string;
    contact?: { displayName?: string; email?: string; phone?: string; website?: string; github?: string };
    languages?: Language[];
    certifications?: Certification[];
    hiddenSections?: string[];
    targetJobId?: string;
  } | null;
  user: { firstName: string; lastName: string; email: string };
  experiences: ServerExperience[];
  educations: ServerEducation[];
  projects: ServerProject[];
};

const month = (iso: string | null) => (iso ? iso.slice(0, 7) : "");

export function newKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random()).slice(2);
}

export function emptyRole(): Role {
  return { key: newKey(), title: "", company: "", location: "", start: "", end: "", current: false, bullets: "" };
}
export function emptySchool(): School {
  return { key: newKey(), school: "", degree: "", field: "", start: "", end: "", bullets: "" };
}
export function emptyProject(): Project {
  return { key: newKey(), name: "", url: "", description: "" };
}

export function fromProfile(profile: ServerProfile): CvDoc {
  const settings = profile.cvSettings ?? {};
  const contact = settings.contact ?? {};
  const template: Template = settings.template === "modern" || settings.template === "compact" ? settings.template : "classic";
  const hidden = (settings.hiddenSections ?? []).filter((id): id is SectionId => SECTIONS.some((section) => section.id === id));

  return {
    firstName: profile.user.firstName,
    lastName: profile.user.lastName,
    displayName: contact.displayName ?? "",
    email: contact.email || profile.user.email,
    phone: contact.phone ?? "",
    location: profile.location ?? "",
    linkedin: profile.linkedinUrl ?? "",
    website: contact.website ?? "",
    github: contact.github ?? "",
    headline: profile.headline ?? "",
    summary: profile.bio ?? "",
    skills: profile.skills ?? [],
    experiences: [...profile.experiences]
      .sort((a, b) => b.startDate.localeCompare(a.startDate))
      .map((item) => ({
        key: item.id,
        id: item.id,
        title: item.title,
        company: item.company,
        location: item.location ?? "",
        start: month(item.startDate),
        end: month(item.endDate),
        current: item.current,
        bullets: item.description ?? "",
      })),
    educations: [...profile.educations]
      .sort((a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? ""))
      .map((item) => ({
        key: item.id,
        id: item.id,
        school: item.school,
        degree: item.degree ?? "",
        field: item.field ?? "",
        start: month(item.startDate),
        end: month(item.endDate),
        bullets: item.description ?? "",
      })),
    projects: profile.projects.map((item) => ({
      key: item.id,
      id: item.id,
      name: item.name,
      url: item.url ?? "",
      description: item.description ?? "",
    })),
    languages: settings.languages ?? [],
    certifications: settings.certifications ?? [],
    template,
    accent: settings.accent && /^#[0-9a-fA-F]{6}$/.test(settings.accent) ? settings.accent : ACCENTS[0],
    hiddenSections: hidden,
    targetJobId: settings.targetJobId ?? "",
  };
}

/** What is stored in `cvSettings` (everything that is not already a profile column). */
export function settingsOf(doc: CvDoc) {
  return {
    template: doc.template,
    accent: doc.accent,
    contact: {
      displayName: doc.displayName,
      email: doc.email,
      phone: doc.phone,
      website: doc.website,
      github: doc.github,
    },
    languages: doc.languages.filter((item) => item.name.trim()),
    certifications: doc.certifications.filter((item) => item.name.trim()),
    hiddenSections: doc.hiddenSections,
    targetJobId: doc.targetJobId,
  };
}

/* ---------- display helpers ---------- */

export function fullName(doc: CvDoc) {
  return doc.displayName.trim() || `${doc.firstName} ${doc.lastName}`.trim();
}

export function monthLabel(value: string) {
  if (!value) return "";
  const [year, month] = value.split("-");
  if (!month) return year;
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

export function periodLabel(start: string, end: string, current: boolean) {
  const from = monthLabel(start);
  const to = current ? "Aujourd'hui" : monthLabel(end);
  if (!from && !to) return "";
  return [from, to].filter(Boolean).join(" – ");
}

export function bulletLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.replace(/^[\s•\-–—*·▪◦]+/, "").trim())
    .filter(Boolean);
}

export function isVisible(doc: CvDoc, id: SectionId) {
  return !doc.hiddenSections.includes(id);
}

export function contactItems(doc: CvDoc) {
  return [doc.email, doc.phone, doc.location, doc.linkedin, doc.website, doc.github]
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => value.replace(/^https?:\/\/(www\.)?/, ""));
}

export function wordCount(value: string) {
  const text = value.trim();
  return text ? text.split(/\s+/).length : 0;
}

/** Total experience in whole years, from the dated roles. Used to keep `experienceYears` in step. */
export function experienceYears(doc: CvDoc) {
  const ranges = doc.experiences
    .filter((role) => role.start)
    .map((role) => {
      const [sy, sm] = role.start.split("-").map(Number);
      const endRaw = role.current || !role.end ? new Date() : new Date(Number(role.end.split("-")[0]), Number(role.end.split("-")[1] ?? 1) - 1, 1);
      const start = new Date(sy, (sm || 1) - 1, 1);
      return [start.getTime(), endRaw.getTime()] as const;
    })
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0]);
  let months = 0;
  let cursor = 0;
  for (const [start, end] of ranges) {
    const from = Math.max(start, cursor);
    if (end > from) months += (end - from) / (1000 * 60 * 60 * 24 * 30.44);
    cursor = Math.max(cursor, end);
  }
  return Math.floor(months / 12);
}

/** Plain text version of the CV: this is what recruiters search and what the ATS audit reads. */
export function cvToText(doc: CvDoc) {
  const out: string[] = [];
  out.push(fullName(doc).toUpperCase());
  if (doc.headline.trim()) out.push(doc.headline.trim());
  const contact = [doc.email, doc.phone, doc.location, doc.linkedin, doc.website, doc.github].map((v) => v.trim()).filter(Boolean);
  if (contact.length) out.push(contact.join(" | "));

  if (isVisible(doc, "summary") && doc.summary.trim()) out.push("", "Résumé", doc.summary.trim());
  if (isVisible(doc, "skills") && doc.skills.length) out.push("", "Compétences", doc.skills.join(", "));

  const roles = doc.experiences.filter((role) => role.title.trim() && role.company.trim());
  if (isVisible(doc, "experience") && roles.length) {
    out.push("", "Expérience");
    for (const role of roles) {
      out.push(`${role.title.trim()} — ${role.company.trim()}${role.location.trim() ? ` (${role.location.trim()})` : ""}`);
      const period = periodLabel(role.start, role.end, role.current);
      if (period) out.push(period);
      for (const line of bulletLines(role.bullets)) out.push(`- ${line}`);
      out.push("");
    }
  }

  const projects = doc.projects.filter((project) => project.name.trim());
  if (isVisible(doc, "projects") && projects.length) {
    out.push("Projets");
    for (const project of projects) {
      out.push(`${project.name.trim()}${project.url.trim() ? ` — ${project.url.trim()}` : ""}`);
      for (const line of bulletLines(project.description)) out.push(`- ${line}`);
    }
    out.push("");
  }

  const schools = doc.educations.filter((school) => school.school.trim());
  if (isVisible(doc, "education") && schools.length) {
    out.push("Formation");
    for (const school of schools) {
      out.push([[school.degree, school.field].filter((v) => v.trim()).join(", "), school.school].filter(Boolean).join(" — "));
      const period = periodLabel(school.start, school.end, false);
      if (period) out.push(period);
    }
    out.push("");
  }

  const certs = doc.certifications.filter((item) => item.name.trim());
  if (isVisible(doc, "certifications") && certs.length) {
    out.push("Certifications");
    for (const item of certs) out.push(`${item.name}${item.issuer ? ` — ${item.issuer}` : ""}${item.year ? ` (${item.year})` : ""}`);
    out.push("");
  }

  const langs = doc.languages.filter((item) => item.name.trim());
  if (isVisible(doc, "languages") && langs.length) {
    out.push("Langues", langs.map((item) => `${item.name}${item.level ? ` (${item.level})` : ""}`).join(", "));
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
