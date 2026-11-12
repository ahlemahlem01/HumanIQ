export const EMBEDDING_DIMENSIONS = 1536;

export const EMBEDDING_PROVIDER = Symbol("EMBEDDING_PROVIDER");
export const LLM_PROVIDER = Symbol("LLM_PROVIDER");

/**
 * Cosine similarity lands in a different band per model: hosted embeddings keep
 * unrelated texts around 0.16, while the local hashing model pushes them near 0.
 * `floor`/`ceiling` rescale that raw band onto a 0-100 product score.
 */
export type SimilarityCalibration = {
  floor: number;
  ceiling: number;
};

/**
 * Vectors are only comparable when produced by the same model, so every batch
 * reports the model that actually generated it — which may differ from the
 * provider's preferred model if it degraded to a fallback mid-request.
 */
export type EmbeddingResult = {
  vectors: number[][];
  model: string;
  calibration: SimilarityCalibration;
};

export interface EmbeddingProvider {
  readonly name: string;
  readonly model: string;
  readonly dimensions: number;
  readonly calibration: SimilarityCalibration;
  embed(texts: string[]): Promise<EmbeddingResult>;
}

export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  complete(input: { system: string; prompt: string; maxTokens?: number }): Promise<string>;
}

export function cosineToScore(similarity: number, calibration: SimilarityCalibration) {
  const { floor, ceiling } = calibration;
  const normalized = (similarity - floor) / (ceiling - floor);
  return Math.round(Math.min(1, Math.max(0, normalized)) * 100);
}

export function calibrationForModel(model: string | null | undefined): SimilarityCalibration {
  if (model && model.startsWith("text-embedding")) return { floor: 0.16, ceiling: 0.78 };
  return { floor: 0.04, ceiling: 0.62 };
}

export function l2Normalize(vector: number[]) {
  let sum = 0;
  for (const value of vector) sum += value * value;
  const norm = Math.sqrt(sum);
  if (norm === 0) return vector;
  return vector.map((value) => value / norm);
}

export function toPgVector(vector: number[]) {
  return `[${vector.join(",")}]`;
}
