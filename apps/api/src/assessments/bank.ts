export type McqQuestion = {
  id: string;
  competency: string;
  prompt: string;
  choices: string[];
  correctIndex: number;
};

export type InterviewBlueprint = {
  competency: string;
  question: string;
  expectedSignals: string[];
};

const TECH_QCM: McqQuestion[] = [
  {
    id: "ts-narrow",
    competency: "TypeScript",
    prompt: "Quel mécanisme TypeScript permet de réduire un union type après un test runtime ?",
    choices: ["Declaration merging", "Type narrowing", "Declaration emit", "Namespace merging"],
    correctIndex: 1,
  },
  {
    id: "react-key",
    competency: "React",
    prompt: "Pourquoi fournir une `key` stable dans une liste React ?",
    choices: [
      "Pour styler l'élément",
      "Pour forcer un render CSS",
      "Pour que React réconcilie correctement l'identité de chaque item",
      "Pour activer le Server Actions",
    ],
    correctIndex: 2,
  },
  {
    id: "nest-di",
    competency: "NestJS",
    prompt: "Dans NestJS, que fait un provider marqué `@Injectable()` ?",
    choices: [
      "Il expose une route HTTP",
      "Il s'enregistre dans le conteneur d'injection de dépendances",
      "Il crée une table Prisma",
      "Il active CORS",
    ],
    correctIndex: 1,
  },
  {
    id: "pg-index",
    competency: "PostgreSQL",
    prompt: "Quel index pgvector est adapté à une recherche cosine à grande échelle ?",
    choices: ["B-Tree", "BRIN", "HNSW (vector_cosine_ops)", "GiST sur texte"],
    correctIndex: 2,
  },
  {
    id: "docker-layer",
    competency: "Docker",
    prompt: "Pourquoi placer `COPY package.json` avant `COPY .` dans un Dockerfile Node ?",
    choices: [
      "Pour réduire les layers de code métier lors d'un npm install inchangé",
      "Parce que Docker l'impose",
      "Pour activer BuildKit",
      "Pour publier l'image plus vite sur le registry",
    ],
    correctIndex: 0,
  },
  {
    id: "sql-explain",
    competency: "SQL",
    prompt: "Que permet `EXPLAIN ANALYZE` ?",
    choices: [
      "D'écrire une vue matérialisée",
      "D'exécuter la requête et d'afficher le plan réel",
      "De verrouiller la table",
      "De créer un index automatiquement",
    ],
    correctIndex: 1,
  },
  {
    id: "code-closure",
    competency: "JavaScript",
    prompt: "Que log `for (var i = 0; i < 3; i++) { setTimeout(() => console.log(i), 0) }` ?",
    choices: ["0 1 2", "3 3 3", "undefined", "1 2 3"],
    correctIndex: 1,
  },
];

const CULTURE_QCM: McqQuestion[] = [
  {
    id: "culture-conflict",
    competency: "Collaboration",
    prompt: "Un désaccord technique bloque une livraison. Quelle posture est la plus saine ?",
    choices: [
      "Imposer la solution du plus sénior",
      "Reporter sans documenter",
      "Expliciter les critères (risque, délai, réversibilité) et trancher",
      "Ouvrir un débat ouvert sur Slack toute la journée",
    ],
    correctIndex: 2,
  },
  {
    id: "culture-feedback",
    competency: "Feedback",
    prompt: "Comment donner un feedback utile après une revue de code tendue ?",
    choices: [
      "Commenter uniquement le style",
      "Décrire le fait, l'impact, et une piste concrète",
      "Attendre le prochain 1:1 dans 3 mois",
      "Le faire en public pour l'effet de levier",
    ],
    correctIndex: 1,
  },
  {
    id: "culture-remote",
    competency: "Remote",
    prompt: "En remote, qu'est-ce qui réduit le plus les malentendus d'équipe ?",
    choices: [
      "Des décisions uniquement orales",
      "Un écrit court de décision (contexte, options, choix)",
      "Plus de réunions quotidiennes",
      "Un canal Slack sans filtrage",
    ],
    correctIndex: 1,
  },
  {
    id: "culture-ownership",
    competency: "Ownership",
    prompt: "Un incident prod survient un vendredi 18h. Réflexe attendu ?",
    choices: [
      "Attendre lundi",
      "Corriger en silence puis partir",
      "Stabiliser, communiquer, écrire un post-mortem factuel",
      "Blâmer le dernier merge",
    ],
    correctIndex: 2,
  },
];

const INTERVIEW_BANK: Record<string, InterviewBlueprint> = {
  TypeScript: {
    competency: "TypeScript",
    question:
      "Comment concevez-vous un typage strict autour d'une API externe instable (champs optionnels, unions, versions) ?",
    expectedSignals: ["unknown", "zod", "narrow", "validation", "dto", "generic", "discriminated"],
  },
  React: {
    competency: "React",
    question:
      "Un écran liste + filtres se met à rerender trop souvent. Comment diagnostiquez-vous et que changez-vous ?",
    expectedSignals: ["memo", "useMemo", "key", "state", "context", "profiler", "query"],
  },
  NestJS: {
    competency: "NestJS",
    question:
      "Comment organisez-vous modules, guards et transactions Prisma pour un use-case comme « postuler à une offre » ?",
    expectedSignals: ["module", "guard", "transaction", "dto", "inject", "service"],
  },
  PostgreSQL: {
    competency: "PostgreSQL",
    question:
      "Vous devez ranking 50k CVs par similarité. Pourquoi pgvector + cosine, et quels index / précautions ?",
    expectedSignals: ["hnsw", "cosine", "ivfflat", "index", "dimension", "normalize"],
  },
  Docker: {
    competency: "Docker",
    question: "Comment construisez-vous une image Node de production petite, reproductible et cache-friendly ?",
    expectedSignals: ["multi-stage", "alpine", "layer", "package-lock", "non-root", "distroless"],
  },
  Figma: {
    competency: "Produit / Design",
    question:
      "Comment passez-vous d'un audit d'accessibilité WCAG à des corrections concrètes dans un design system ?",
    expectedSignals: ["contrast", "focus", "aria", "composant", "token", "wcag"],
  },
};

const BEHAVIORAL: InterviewBlueprint = {
  competency: "Comportement",
  question:
    "Racontez un désaccord fort avec un pair. Quel était l'enjeu, que vous avez fait, et qu'est-ce qui a changé ensuite ?",
  expectedSignals: ["contexte", "impact", "décision", "écoute", "résultat", "apprentissage"],
};

const SYSTEM: InterviewBlueprint = {
  competency: "System Design",
  question:
    "Esquissez le design d'un ATS : ingestion de CV, matching, Kanban temps réel. Où placez-vous les files, le search et l'IA ?",
  expectedSignals: ["queue", "postgres", "vector", "websocket", "s3", "worker", "idempoten"],
};

export function qcmForSkills(skills: string[]): McqQuestion[] {
  const wanted = new Set(skills.map((s) => s.toLowerCase()));
  const picked = TECH_QCM.filter((q) =>
    [...wanted].some((skill) => q.competency.toLowerCase().includes(skill) || skill.includes(q.competency.toLowerCase())),
  );
  const extra = TECH_QCM.filter((q) => !picked.includes(q));
  return [...picked, ...extra].slice(0, 5);
}

export function cultureQuestionnaire(): McqQuestion[] {
  return CULTURE_QCM;
}

export function interviewPlan(skills: string[], senior: boolean): InterviewBlueprint[] {
  const plan: InterviewBlueprint[] = [];
  for (const skill of skills) {
    const hit = INTERVIEW_BANK[skill] ?? Object.entries(INTERVIEW_BANK).find(([key]) =>
      skill.toLowerCase().includes(key.toLowerCase()),
    )?.[1];
    if (hit && !plan.some((item) => item.competency === hit.competency)) plan.push(hit);
    if (plan.length >= 3) break;
  }
  if (!plan.length) plan.push(INTERVIEW_BANK.TypeScript);
  plan.push(BEHAVIORAL);
  plan.push(senior ? SYSTEM : {
    competency: "Motivation",
    question: "Pourquoi ce rôle, maintenant ? Qu'est-ce que vous voulez apprendre dans les 12 prochains mois ?",
    expectedSignals: ["apprentissage", "produit", "impact", "équipe", "stack"],
  });
  return plan.slice(0, 5);
}

export function scoreMcq(questions: McqQuestion[], answers: number[]) {
  let correct = 0;
  const detail = questions.map((question, index) => {
    const given = answers[index];
    const ok = given === question.correctIndex;
    if (ok) correct++;
    return { id: question.id, competency: question.competency, correct: ok };
  });
  const score = Math.round((correct / Math.max(questions.length, 1)) * 100);
  return { score, correct, total: questions.length, detail };
}
