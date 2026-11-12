import { LlmProvider } from "../ai/providers/types";
import { InterviewBlueprint } from "../assessments/bank";

export function heuristicScore(answer: string, signals: string[]) {
  const text = normalize(answer);
  if (text.length < 40) {
    return {
      score: 18,
      feedback: "Réponse trop courte pour juger. Développez le contexte, le choix, et le résultat.",
    };
  }
  const hits = signals.filter((signal) => text.includes(normalize(signal)));
  const coverage = signals.length ? hits.length / signals.length : 0;
  const depth = Math.min(1, text.length / 420);
  const floor = text.length >= 120 ? 34 : 18;
  const score = Math.round(
    Math.min(95, Math.max(floor, coverage * 70 + depth * 25 + (hits.length ? 5 : 0))),
  );
  const feedback =
    hits.length >= 2
      ? `Points perçus : ${hits.slice(0, 4).join(", ")}. Vous pouvez encore chiffrer l'impact.`
      : `Peu de signaux techniques détectés (${signals.slice(0, 3).join(", ")}). Ancrez la réponse dans un cas vécu.`;
  return { score, feedback };
}

export async function llmScore(
  llm: LlmProvider,
  question: string,
  answer: string,
  competency: string,
) {
  const raw = await llm.complete({
    system:
      "Tu es un interviewer tech exigeant mais juste. Tu notes sur 100. Réponds UNIQUEMENT en JSON {\"score\":number,\"feedback\":string}.",
    prompt: [
      `COMPETENCE: ${competency}`,
      `QUESTION: ${question}`,
      `REPONSE: ${answer}`,
      "score entier 0-100. feedback: 2 phrases en français, vouvoiement, concret.",
    ].join("\n"),
    maxTokens: 250,
  });
  const parsed = extractJson(raw);
  if (!parsed) return null;
  const score = Number(parsed.score);
  if (!Number.isFinite(score)) return null;
  return {
    score: Math.round(Math.min(100, Math.max(0, score))),
    feedback: String(parsed.feedback ?? "").slice(0, 600),
  };
}

export async function llmQuestions(
  llm: LlmProvider,
  input: { title: string; skills: string[]; seniority: string },
) {
  const raw = await llm.complete({
    system:
      "Tu conçois un entretien structuré. Réponds UNIQUEMENT en JSON {\"questions\":[{\"competency\":\"\",\"question\":\"\",\"expectedSignals\":[\"\"]}]} — 5 items.",
    prompt: `Offre: ${input.title}. Compétences: ${input.skills.join(", ")}. Niveau: ${input.seniority}. Questions en français, concrètes, sans jargon vide.`,
    maxTokens: 900,
  });
  const parsed = extractJson(raw);
  const questions = parsed?.questions;
  if (!Array.isArray(questions) || questions.length < 3) return null;
  return questions.slice(0, 5).map((item) => ({
    competency: String(item.competency ?? "Général").slice(0, 80),
    question: String(item.question ?? "").slice(0, 500),
    expectedSignals: Array.isArray(item.expectedSignals)
      ? item.expectedSignals.map((s: unknown) => String(s).slice(0, 40)).slice(0, 8)
      : [],
  })) as InterviewBlueprint[];
}

export function summarize(scores: number[], competencies: string[]) {
  if (!scores.length) return "Entretien incomplet.";
  const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const weakest = competencies[scores.indexOf(Math.min(...scores))];
  const strongest = competencies[scores.indexOf(Math.max(...scores))];
  const verdict =
    avg >= 75 ? "Performance solide." : avg >= 55 ? "Socle correct, quelques trous." : "Préparation insuffisante sur le fond.";
  return `${verdict} Meilleure compétence : ${strongest}. À retravailler : ${weakest}. Score global ${avg}/100.`;
}

function extractJson(raw: string): Record<string, any> | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as Record<string, any>;
  } catch {
    return null;
  }
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
