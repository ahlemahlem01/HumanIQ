import { Prisma } from "@prisma/client";

const TEMPLATES = ["classic", "modern", "compact"] as const;
const SECTIONS = ["summary", "experience", "education", "skills", "projects", "languages", "certifications"] as const;

const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

/**
 * The CV Studio stores its preferences and a few extras (phone, languages, certifications) as JSON.
 * Nothing is trusted from the request body: only known keys survive, with length limits.
 * Returns `undefined` when the caller did not send settings (leave the column alone).
 */
export function sanitizeCvSettings(input: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull | undefined {
  if (input === undefined) return undefined;
  if (input === null) return Prisma.DbNull;
  if (typeof input !== "object" || Array.isArray(input)) return undefined;
  const raw = input as Record<string, unknown>;

  const contact = (raw.contact && typeof raw.contact === "object" ? raw.contact : {}) as Record<string, unknown>;
  const accent = typeof raw.accent === "string" && /^#[0-9a-fA-F]{6}$/.test(raw.accent) ? raw.accent : "#1a3585";

  const languages = (Array.isArray(raw.languages) ? raw.languages : [])
    .slice(0, 8)
    .map((item) => {
      const row = (item ?? {}) as Record<string, unknown>;
      return { name: text(row.name, 40), level: text(row.level, 40) };
    })
    .filter((row) => row.name);

  const certifications = (Array.isArray(raw.certifications) ? raw.certifications : [])
    .slice(0, 10)
    .map((item) => {
      const row = (item ?? {}) as Record<string, unknown>;
      return { name: text(row.name, 120), issuer: text(row.issuer, 80), year: text(row.year, 10) };
    })
    .filter((row) => row.name);

  const hidden = (Array.isArray(raw.hiddenSections) ? raw.hiddenSections : [])
    .filter((item): item is (typeof SECTIONS)[number] => typeof item === "string" && (SECTIONS as readonly string[]).includes(item));

  return {
    template: (TEMPLATES as readonly string[]).includes(String(raw.template)) ? String(raw.template) : "classic",
    accent,
    contact: {
      displayName: text(contact.displayName, 80),
      email: text(contact.email, 120),
      phone: text(contact.phone, 40),
      website: text(contact.website, 200),
      github: text(contact.github, 200),
    },
    languages,
    certifications,
    hiddenSections: Array.from(new Set(hidden)),
    targetJobId: text(raw.targetJobId, 60),
  };
}
