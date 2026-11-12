export type ProfileSignals = {
  skills: string[];
  cvText?: string | null;
  experienceYears: number;
  location?: string | null;
};

export type JobSignals = {
  requiredSkills: string[];
  description: string;
  location: string;
  title: string;
};

export type KeywordMatch = {
  score: number;
  matchedKeywords: string[];
  missingKeywords: string[];
  coverage: number;
};

/** Weighting between the vector score and the literal keyword score. */
export const SEMANTIC_WEIGHT = 0.6;
export const KEYWORD_WEIGHT = 1 - SEMANTIC_WEIGHT;

export function scoreCvAgainstJob(profile: ProfileSignals, job: JobSignals): KeywordMatch {
  const haystack = `${(profile.cvText ?? "").toLowerCase()} ${profile.skills.join(" ").toLowerCase()}`;
  const required = unique(job.requiredSkills.map((s) => s.trim()).filter(Boolean));
  const present: string[] = [];
  const missing: string[] = [];

  for (const skill of required) {
    if (mentionsSkill(haystack, profile.skills, skill)) present.push(skill);
    else missing.push(skill);
  }

  const coverage = required.length ? present.length / required.length : 0.4;
  const seniorityHint = /\b(senior|lead|principal|staff)\b/i.test(job.title)
    ? clamp(profile.experienceYears / 7, 0, 1)
    : clamp(profile.experienceYears / 4, 0, 1);
  const locationBonus =
    profile.location &&
    job.location.toLowerCase().includes(profile.location.split(",")[0].toLowerCase())
      ? 8
      : 0;

  const score = Math.round(clamp(coverage * 75 + seniorityHint * 17 + locationBonus, 8, 99));

  return { score, matchedKeywords: present, missingKeywords: missing, coverage };
}

/**
 * Blends the pgvector similarity with literal keyword coverage. The vector side
 * captures phrasing a keyword pass misses; the keyword side keeps hard
 * requirements visible. When no vector exists we fall back to keywords alone.
 */
export function blendScores(keyword: KeywordMatch, semanticScore: number | null) {
  if (semanticScore === null) {
    return { score: keyword.score, semanticScore: null, keywordScore: keyword.score };
  }
  const score = Math.round(semanticScore * SEMANTIC_WEIGHT + keyword.score * KEYWORD_WEIGHT);
  return { score, semanticScore, keywordScore: keyword.score };
}

const SKILL_CATALOG = [
  "TypeScript", "JavaScript", "React", "Next.js", "Vue", "Angular", "Svelte",
  "Node.js", "NestJS", "Express", "Deno", "Bun",
  "Python", "Django", "FastAPI", "Flask", "Java", "Spring", "Kotlin", "Scala",
  "C#", ".NET", "Go", "Rust", "PHP", "Laravel", "Symfony", "Ruby", "Rails",
  "PostgreSQL", "MySQL", "MongoDB", "Redis", "Elasticsearch", "Meilisearch",
  "pgvector", "SQL", "GraphQL", "REST", "gRPC", "Kafka", "RabbitMQ",
  "Docker", "Kubernetes", "Terraform", "Ansible", "AWS", "GCP", "Azure",
  "CI/CD", "Jenkins", "GitHub Actions", "GitLab", "Linux", "Nginx",
  "Machine Learning", "Deep Learning", "NLP", "TensorFlow", "PyTorch",
  "LangChain", "RAG", "Pandas", "NumPy", "Spark", "dbt", "Airflow", "Snowflake",
  "Figma", "Design System", "Accessibilité", "WCAG", "UX", "UI", "Product",
  "Agile", "Scrum", "Kanban", "Jira", "System Design", "Microservices",
  "Cypress", "Playwright", "Jest", "Vitest", "TDD", "Git",
];

/** Aliases let us catch the way skills are actually written on a CV. */
const SKILL_ALIASES: Record<string, string[]> = {
  "Next.js": ["nextjs", "next js"],
  "Node.js": ["nodejs", "node js"],
  "NestJS": ["nest.js", "nest js"],
  ".NET": ["dotnet", "asp.net", "net core"],
  "C#": ["csharp", "c sharp"],
  "CI/CD": ["cicd", "ci cd", "integration continue"],
  PostgreSQL: ["postgres", "psql"],
  "Machine Learning": ["ml", "apprentissage automatique"],
  "Deep Learning": ["dl", "apprentissage profond"],
  NLP: ["traitement du langage", "natural language"],
  Accessibilité: ["accessibilite", "a11y", "accessibility"],
  Kubernetes: ["k8s", "k3s"],
  "GitHub Actions": ["github action"],
  "System Design": ["architecture logicielle", "conception systeme"],
  "Design System": ["design systeme"],
};

export function extractSkillsFromText(text: string) {
  const haystack = normalize(text);
  return SKILL_CATALOG.filter((skill) => {
    if (hasTerm(haystack, normalize(skill))) return true;
    return (SKILL_ALIASES[skill] ?? []).some((alias) => hasTerm(haystack, normalize(alias)));
  });
}

function hasTerm(haystack: string, needle: string) {
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(haystack);
}

/** Best-effort years-of-experience read across common French and English phrasings. */
export function inferExperienceYears(text: string) {
  const patterns = [
    /(\d{1,2})\s*(?:\+)?\s*(?:ans|annees|années)\s+d['’]?\s*experience/i,
    /(\d{1,2})\s*(?:\+)?\s*years?\s+(?:of\s+)?experience/i,
    /experience\s*(?:de|:)?\s*(\d{1,2})\s*ans/i,
    /(\d{1,2})\s*(?:ans|years)\b/i,
  ];
  const normalized = normalize(text);
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match) {
      const years = Number(match[1]);
      if (years > 0 && years < 60) return years;
    }
  }
  return 0;
}

function mentionsSkill(haystack: string, skills: string[], skill: string) {
  const needle = normalize(skill);
  if (skills.some((candidate) => normalize(candidate) === needle)) return true;
  if (normalize(haystack).includes(needle)) return true;
  return (SKILL_ALIASES[skill] ?? []).some((alias) =>
    normalize(haystack).includes(normalize(alias)),
  );
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
