import { Logger } from "@nestjs/common";
import {
  EMBEDDING_DIMENSIONS,
  EmbeddingProvider,
  EmbeddingResult,
  SimilarityCalibration,
} from "./types";
import { LocalEmbeddingProvider } from "./local-embedding.provider";

type OpenAIEmbeddingResponse = {
  data: { embedding: number[]; index: number }[];
};

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = "openai";
  readonly dimensions = EMBEDDING_DIMENSIONS;
  readonly calibration: SimilarityCalibration = { floor: 0.16, ceiling: 0.78 };

  private readonly logger = new Logger(OpenAIEmbeddingProvider.name);
  private readonly fallback = new LocalEmbeddingProvider();

  constructor(
    private readonly apiKey: string,
    readonly model = process.env.AI_EMBEDDING_MODEL ?? "text-embedding-3-small",
    private readonly baseUrl = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
  ) {}

  async embed(texts: string[]): Promise<EmbeddingResult> {
    try {
      const response = await fetch(`${this.baseUrl}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          input: texts,
          dimensions: this.dimensions,
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        throw new Error(`OpenAI ${response.status}: ${await response.text()}`);
      }

      const payload = (await response.json()) as OpenAIEmbeddingResponse;
      const vectors = payload.data
        .sort((a, b) => a.index - b.index)
        .map((item) => item.embedding);

      return { vectors, model: this.model, calibration: this.calibration };
    } catch (error) {
      // A hosted outage must not break job publishing or CV uploads, so we
      // degrade to the local model. The result reports the local model name so
      // these vectors are never compared against hosted ones.
      this.logger.warn(
        `OpenAI embeddings failed, using local model for this batch: ${
          error instanceof Error ? error.message : error
        }`,
      );
      return this.fallback.embed(texts);
    }
  }
}
