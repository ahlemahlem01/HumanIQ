export type CodeCase = { id: string; args: unknown[]; expected: unknown };

export type CodeChallenge = {
  id: string;
  title: string;
  competency: string;
  prompt: string;
  starter: string;
  functionName: string;
  publicTests: CodeCase[];
  hiddenTests: CodeCase[];
};

const BLEND: CodeChallenge = {
  id: "blend-score",
  title: "Score ATS hybride",
  competency: "Algorithme",
  prompt:
    "Implémentez `blendScore(semantic, keyword)` : arrondi à l'entier le plus proche de `semantic * 0.6 + keyword * 0.4`. C'est le mélange utilisé par HumanIQ (60 % sémantique, 40 % mots-clés).",
  starter: `function blendScore(semantic, keyword) {
  // semantic * 0.6 + keyword * 0.4, arrondi
}

`,
  functionName: "blendScore",
  publicTests: [
    { id: "p1", args: [80, 50], expected: 68 },
    { id: "p2", args: [0, 100], expected: 40 },
  ],
  hiddenTests: [
    { id: "h1", args: [100, 0], expected: 60 },
    { id: "h2", args: [70, 70], expected: 70 },
    { id: "h3", args: [33, 34], expected: 33 },
  ],
};

const TOP: CodeChallenge = {
  id: "top-matches",
  title: "Top-K matching",
  competency: "Structures",
  prompt:
    "Implémentez `topMatches(items, k)` : `items` est un tableau `{ id, score }`. Retournez les `k` ids triés par score décroissant (égalité : garder l'ordre d'origine).",
  starter: `function topMatches(items, k) {
  // return string[]
}

`,
  functionName: "topMatches",
  publicTests: [
    {
      id: "p1",
      args: [
        [
          { id: "a", score: 40 },
          { id: "b", score: 90 },
          { id: "c", score: 70 },
        ],
        2,
      ],
      expected: ["b", "c"],
    },
    {
      id: "p2",
      args: [[{ id: "x", score: 10 }], 3],
      expected: ["x"],
    },
  ],
  hiddenTests: [
    {
      id: "h1",
      args: [
        [
          { id: "a", score: 50 },
          { id: "b", score: 50 },
          { id: "c", score: 49 },
        ],
        2,
      ],
      expected: ["a", "b"],
    },
    {
      id: "h2",
      args: [[], 2],
      expected: [],
    },
    {
      id: "h3",
      args: [
        [
          { id: "z", score: 1 },
          { id: "y", score: 99 },
        ],
        0,
      ],
      expected: [],
    },
  ],
};

const SKILLS: CodeChallenge = {
  id: "normalize-skills",
  title: "Déduplication de compétences",
  competency: "Parsing",
  prompt:
    "Implémentez `normalizeSkills(tags)` : trim, ignore les vides, déduplique en insensible à la casse, conserve la première graphie rencontrée.",
  starter: `function normalizeSkills(tags) {
  // return string[]
}

`,
  functionName: "normalizeSkills",
  publicTests: [
    { id: "p1", args: [["React", "react", " TypeScript "]], expected: ["React", "TypeScript"] },
    { id: "p2", args: [["", "SQL", "sql"]], expected: ["SQL"] },
  ],
  hiddenTests: [
    { id: "h1", args: [[]], expected: [] },
    { id: "h2", args: [["NestJS", "nestjs", "NESTJS"]], expected: ["NestJS"] },
    { id: "h3", args: [["Figma", "figma", "UX", "ux"]], expected: ["Figma", "UX"] },
  ],
};

export function codeChallengesForSkills(skills: string[]): CodeChallenge[] {
  const hay = skills.join(" ").toLowerCase();
  const second = /figma|design|ux|ui|product/.test(hay) ? SKILLS : TOP;
  return [BLEND, second];
}

export function stripHidden(challenge: CodeChallenge) {
  const { hiddenTests: _hidden, ...rest } = challenge;
  return rest;
}
