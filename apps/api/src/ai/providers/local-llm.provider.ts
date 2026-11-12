import { LlmProvider } from "./types";

/**
 * Deterministic stand-in used when no LLM key is configured. It reads the
 * structured facts the caller already embedded in the prompt and reformats
 * them, so the product stays demoable offline without inventing content.
 */
export class LocalLlmProvider implements LlmProvider {
  readonly name = "local";
  readonly model = "template-v1";

  async complete({ prompt }: { system: string; prompt: string; maxTokens?: number }) {
    const facts = parseFacts(prompt);
    const score = facts.score ? Number(facts.score) : null;
    const matched = splitList(facts.matched);
    const missing = splitList(facts.missing);

    const verdict =
      score === null
        ? "Analyse indisponible."
        : score >= 75
          ? "Profil fortement aligné avec cette offre."
          : score >= 50
            ? "Profil partiellement aligné : quelques écarts à combler."
            : "Écart important entre le profil et les attentes de l'offre.";

    const lines = [verdict];

    if (facts.title) {
      lines.push("", `Offre analysée : ${facts.title}.`);
    }
    if (score !== null) {
      lines.push(
        `Score de compatibilité global : ${score}/100` +
          (facts.semantic ? ` (sémantique ${facts.semantic}, mots-clés ${facts.keyword}).` : "."),
      );
    }
    if (matched.length) {
      lines.push("", `Points forts retenus : ${matched.join(", ")}.`);
    }
    if (missing.length) {
      lines.push(
        "",
        `Compétences à renforcer en priorité : ${missing.join(", ")}.`,
        "Suggestion : mentionnez explicitement ces mots-clés dans votre CV s'ils font partie de votre expérience — un ATS ne les devine pas.",
      );
    } else if (matched.length) {
      lines.push("", "Aucun mot-clé obligatoire manquant détecté.");
    }

    lines.push(
      "",
      "— Généré hors ligne (aucune clé LLM configurée). Renseignez OPENAI_API_KEY ou ANTHROPIC_API_KEY pour un feedback rédigé par un modèle.",
    );

    return lines.join("\n");
  }
}

function parseFacts(prompt: string) {
  const facts: Record<string, string> = {};
  for (const line of prompt.split("\n")) {
    const match = line.match(/^([A-Z_]+):\s*(.*)$/);
    if (match) facts[match[1].toLowerCase()] = match[2].trim();
  }
  return facts as {
    score?: string;
    semantic?: string;
    keyword?: string;
    matched?: string;
    missing?: string;
    title?: string;
  };
}

function splitList(value?: string) {
  if (!value || value === "-" || value.toLowerCase() === "none") return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
