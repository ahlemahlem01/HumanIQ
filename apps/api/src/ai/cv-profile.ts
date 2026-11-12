import { extractSkillsFromText, inferExperienceYears } from "./matching";

export type ParsedExperience = {
  title: string;
  company: string;
  location: string | null;
  startDate: Date;
  endDate: Date | null;
  current: boolean;
  description: string | null;
};

export type ParsedEducation = {
  school: string;
  degree: string | null;
  field: string | null;
  startDate: Date | null;
  endDate: Date | null;
  description: string | null;
};

export type ParsedCvProfile = {
  headline: string | null;
  bio: string | null;
  location: string | null;
  experienceYears: number;
  skills: string[];
  experiences: ParsedExperience[];
  educations: ParsedEducation[];
};

const MONTHS: Record<string, number> = {
  janvier: 1, jan: 1, january: 1,
  février: 2, fevrier: 2, feb: 2, february: 2,
  mars: 3, mar: 3, march: 3,
  avril: 4, apr: 4, april: 4,
  mai: 5, may: 5,
  juin: 6, jun: 6, june: 6,
  juillet: 7, jul: 7, july: 7,
  août: 8, aout: 8, aug: 8, august: 8,
  septembre: 9, sep: 9, sept: 9, september: 9,
  octobre: 10, oct: 10, october: 10,
  novembre: 11, nov: 11, november: 11,
  décembre: 12, decembre: 12, dec: 12, december: 12,
};

const MONTH = Object.keys(MONTHS).join("|");
const PRESENT = "aujourd['’]?hui|present|présent|actuel|en cours|now|current";
const RANGE = new RegExp(
  `(?:(${MONTH})\\.?\\s+)?((?:19|20)\\d{2})\\s*[-–—/àa]+\\s*(?:(${PRESENT})|(?:(${MONTH})\\.?\\s+)?((?:19|20)\\d{2}))`,
  "i",
);
const NUMERIC_RANGE = new RegExp(
  `(\\d{1,2})[/.-]((?:19|20)\\d{2})\\s*[-–—]+\\s*(?:(${PRESENT})|(\\d{1,2})[/.-]((?:19|20)\\d{2}))`,
  "i",
);

const DEGREE = /\b(master|licence|license|bachelor|doctorat|phd|mba|msc|bsc|dut|bts|ingénieur|ingenieur|bac\s*\+\s*\d)\b/i;

export function parseCvProfile(text: string, person?: { firstName?: string; lastName?: string }): ParsedCvProfile {
  const lines = text.replace(/\r/g, "").split("\n").map((line) => line.trim());
  const sections = splitSections(lines);
  const preamble = sections.get("preamble") ?? [];
  const about = cleanLines(sections.get("about") ?? []);
  const skillLines = cleanLines(sections.get("skills") ?? []);
  const experiences = parseExperience(sections.get("experience") ?? []);
  const educations = parseEducation(sections.get("education") ?? []);

  const header = headerFields(preamble, person);
  const headline = header.headline ?? experiences[0]?.title ?? null;
  const location = header.location ?? experiences.find((item) => item.location)?.location ?? null;
  const bio = (about.join("\n") || header.bio || "").slice(0, 1000) || null;
  const skills = unique([
    ...extractSkillsFromText(text),
    ...skillLines.flatMap(splitSkillLine).filter((skill) => skill.length >= 2 && skill.length <= 40),
  ]).slice(0, 24);

  let experienceYears = inferExperienceYears(text);
  if (!experienceYears && experiences.length) {
    const earliest = experiences.reduce((min, item) => (item.startDate < min ? item.startDate : min), experiences[0].startDate);
    experienceYears = Math.max(1, new Date().getUTCFullYear() - earliest.getUTCFullYear());
  }

  return { headline, bio, location, experienceYears, skills, experiences, educations };
}

function splitSections(lines: string[]) {
  const sections = new Map<string, string[]>();
  let current = "preamble";
  sections.set(current, []);
  for (const line of lines) {
    const kind = sectionKind(line);
    if (kind) {
      current = kind;
      if (!sections.has(current)) sections.set(current, []);
      continue;
    }
    sections.get(current)?.push(line);
  }
  return sections;
}

function sectionKind(line: string) {
  const value = normalize(line).replace(/:$/, "");
  if (/^(experiences?|experience professionnelle|work experience|professional experience|parcours professionnel)$/.test(value)) {
    return "experience";
  }
  if (/^(formation|etudes|education|educations)$/.test(value)) return "education";
  if (/^(competences|skills|technical skills|competences techniques)$/.test(value)) return "skills";
  if (/^(profil|a propos|summary|about|objectif)$/.test(value)) return "about";
  return null;
}

function headerFields(lines: string[], person?: { firstName?: string; lastName?: string }) {
  const name = normalize(`${person?.firstName ?? ""} ${person?.lastName ?? ""}`).trim();
  const kept = cleanLines(lines).filter((line) => {
    if (isContact(line)) return false;
    if (name && normalize(line) === name) return false;
    return true;
  });
  const locationLine = kept.find((line) => isLocation(line));
  const headline = kept.find((line) => line !== locationLine && line.length <= 90) ?? null;
  const bio = kept.filter((line) => line !== headline && line !== locationLine).join("\n");
  return { headline, location: locationLine ? tidy(locationLine) : null, bio };
}

function parseExperience(lines: string[]): ParsedExperience[] {
  const indexed = lines.map((line, index) => ({ line, index })).filter((item) => dateOf(item.line));
  return indexed
    .map((item, position) => {
      const next = indexed[position + 1]?.index;
      const before = cleanLines(lines.slice(Math.max(0, item.index - 2), item.index));
      const stop = next === undefined ? lines.length : Math.max(item.index + 1, next - 2);
      const after = cleanLines(lines.slice(item.index + 1, stop));
      const date = dateOf(item.line);
      if (!date) return null;
      const location = after.find((line) => isLocation(line)) ?? null;
      const { title, company } = roleFrom(before);
      if (!title || !company) return null;
      const description = after.filter((line) => line !== location).join("\n");
      return {
        title,
        company,
        location: location ? tidy(location) : null,
        startDate: date.start,
        endDate: date.end,
        current: date.current,
        description: description ? description.slice(0, 1000) : null,
      };
    })
    .filter((item): item is ParsedExperience => Boolean(item));
}

function parseEducation(lines: string[]): ParsedEducation[] {
  const indexed = lines.map((line, index) => ({ line, index })).filter((item) => dateOf(item.line) || DEGREE.test(item.line));
  const seen = new Set<number>();
  const items: ParsedEducation[] = [];
  for (const item of indexed) {
    if (seen.has(item.index)) continue;
    const window = cleanLines(lines.slice(Math.max(0, item.index - 2), Math.min(lines.length, item.index + 4)));
    const dateLine = window.find((line) => dateOf(line));
    const date = dateLine ? dateOf(dateLine) : null;
    const degreeLine = window.find((line) => DEGREE.test(line) && line !== dateLine);
    const school = window.find((line) => line !== dateLine && line !== degreeLine && !isLocation(line) && line.length > 2);
    if (!degreeLine && !school) continue;
    window.forEach((line) => {
      const index = lines.indexOf(line);
      if (index >= 0) seen.add(index);
    });
    const degree = splitDegree(degreeLine ?? "");
    items.push({
      school: tidy(school || degreeLine || "Formation"),
      degree: degree.degree,
      field: degree.field,
      startDate: date?.start ?? null,
      endDate: date?.end ?? null,
      description: null,
    });
  }
  return items.filter((item, index, all) => all.findIndex((other) => other.school === item.school && other.degree === item.degree) === index);
}

function roleFrom(lines: string[]) {
  const useful = lines.filter((line) => !dateOf(line) && !isLocation(line));
  const combined = useful.find((line) => /\s[-–—|]\s|\schez\s|\sat\s/i.test(line));
  if (combined) {
    const [left, right] = combined.split(/\s[-–—|]\s|\schez\s|\sat\s/i);
    return { title: tidy(left), company: tidy(right) };
  }
  return { title: tidy(useful[0] ?? ""), company: tidy(useful[1] ?? useful[0] ?? "") };
}

function splitDegree(line: string) {
  if (!line) return { degree: null, field: null };
  const match = line.match(DEGREE);
  if (!match) return { degree: tidy(line), field: null };
  const degree = match[1][0].toUpperCase() + match[1].slice(1);
  const field = line.replace(match[0], "").replace(/^[\s,:-]+|[\s,:-]+$/g, "");
  return { degree, field: field || null };
}

function dateOf(line: string) {
  const numeric = line.match(NUMERIC_RANGE);
  if (numeric) {
    const current = Boolean(numeric[3]);
    return {
      start: utcDate(Number(numeric[2]), Number(numeric[1])),
      end: current ? null : utcDate(Number(numeric[5]), Number(numeric[4])),
      current,
    };
  }
  const named = line.match(RANGE);
  if (!named) return null;
  const current = Boolean(named[3]);
  return {
    start: utcDate(Number(named[2]), monthNumber(named[1])),
    end: current ? null : utcDate(Number(named[5]), monthNumber(named[4])),
    current,
  };
}

function monthNumber(value?: string) {
  if (!value) return 1;
  return MONTHS[normalize(value)] ?? 1;
}

function utcDate(year: number, month: number) {
  return new Date(Date.UTC(year, Math.max(0, month - 1), 1));
}

function isLocation(line: string) {
  if (line.length > 40 || /\d{3,}/.test(line)) return false;
  return /^(paris|lyon|tunis|lille|marseille|bordeaux|nantes|toulouse|nice|remote|télétravail|teletravail|france|tunisie|london|berlin|montréal|montreal)\b/i.test(line)
    || /,\s*(france|tunisie|belgique|suisse|uk|usa)\b/i.test(line);
}

function isContact(line: string) {
  return /@/.test(line) || /^\+?\d[\d\s().-]{7,}$/.test(line) || /^https?:\/\//i.test(line);
}

function splitSkillLine(line: string) {
  return line
    .replace(/^[-•*]\s*/, "")
    .split(/[,;|·]/)
    .map((part) => tidy(part))
    .filter(Boolean);
}

function cleanLines(lines: string[]) {
  return lines.map((line) => line.trim()).filter(Boolean);
}

function tidy(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function unique(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = normalize(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalize(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
