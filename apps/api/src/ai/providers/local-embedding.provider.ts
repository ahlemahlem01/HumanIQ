import {
  EMBEDDING_DIMENSIONS,
  EmbeddingProvider,
  EmbeddingResult,
  SimilarityCalibration,
  l2Normalize,
} from "./types";

export const LOCAL_EMBEDDING_MODEL = "local-hashing-v1";

/**
 * Deterministic signed feature-hashing embedding. No network, no API key, and
 * stable across restarts so stored vectors stay comparable. Signed buckets keep
 * hash collisions from inflating similarity between unrelated documents.
 */
export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly name = "local";
  readonly model = LOCAL_EMBEDDING_MODEL;
  readonly dimensions = EMBEDDING_DIMENSIONS;
  readonly calibration: SimilarityCalibration = { floor: 0.04, ceiling: 0.62 };

  async embed(texts: string[]): Promise<EmbeddingResult> {
    return {
      vectors: texts.map((text) => this.embedOne(text)),
      model: this.model,
      calibration: this.calibration,
    };
  }

  private embedOne(text: string) {
    const vector = new Array<number>(this.dimensions).fill(0);
    const tokens = tokenize(text);
    if (!tokens.length) return vector;

    const counts = new Map<string, number>();
    for (const token of tokens) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
    for (let i = 0; i < tokens.length - 1; i++) {
      const bigram = `${tokens[i]}_${tokens[i + 1]}`;
      counts.set(bigram, (counts.get(bigram) ?? 0) + 1);
    }

    for (const [term, count] of counts) {
      const hash = fnv1a(term);
      const index = hash % this.dimensions;
      const sign = (hash >>> 31) & 1 ? -1 : 1;
      // Sublinear term frequency keeps repeated buzzwords from dominating.
      vector[index] += sign * (1 + Math.log(count));
    }

    return l2Normalize(vector);
  }
}

const STOPWORDS = new Set([
  "les", "des", "une", "aux", "pour", "avec", "dans", "sur", "par", "que", "qui",
  "est", "sont", "nos", "vos", "ses", "leur", "leurs", "and", "the", "for", "with",
  "you", "your", "our", "from", "are", "was", "will", "have", "has",
]);

function tokenize(text: string) {
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const raw = normalized.match(/[a-z0-9][a-z0-9+#.]{1,}/g) ?? [];
  return raw.filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

function fnv1a(value: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
