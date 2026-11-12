export type LinkedInImportInput = {
  jobId: string;
  linkedinUrl?: string;
  fullName?: string;
  headline?: string;
  location?: string;
  about?: string;
  experience?: string[];
  skills?: string[];
  rawText?: string;
};

export function linkedinHandle(url?: string, name?: string) {
  const fromUrl = url?.match(/linkedin\.com\/in\/([^/?#]+)/i)?.[1];
  if (fromUrl) {
    return decodeURIComponent(fromUrl)
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "")
      .slice(0, 60);
  }
  const slug = (name ?? "profil")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return slug || "profil";
}

export function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "Profil", lastName: "LinkedIn" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "LinkedIn" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export function composeCvText(input: LinkedInImportInput) {
  const blocks = [
    input.fullName,
    input.headline,
    input.location,
    input.about,
    input.experience?.length ? `Expérience\n${input.experience.join("\n")}` : "",
    input.skills?.length ? `Compétences : ${input.skills.join(", ")}` : "",
    input.rawText,
  ].filter((block) => block && block.trim());
  return blocks.join("\n\n").trim();
}

/** Recruiter paste fallback when the Chrome DOM scrape is empty. */
export function hydrateFromRawText(input: LinkedInImportInput): LinkedInImportInput {
  if (input.fullName && input.rawText) return input;
  const raw = input.rawText?.trim();
  if (!raw) return input;
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return {
    ...input,
    fullName: input.fullName || lines[0],
    headline: input.headline || lines[1],
    location: input.location || lines.find((line) => /paris|lyon|tunis|remote|france|remote/i.test(line)),
  };
}
