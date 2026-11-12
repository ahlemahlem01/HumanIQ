import { Logger, Module } from "@nestjs/common";
import { AiController } from "./ai.controller";
import { AiService } from "./ai.service";
import { EmbeddingsService } from "./embeddings.service";
import { ParsingService } from "./parsing.service";
import { EMBEDDING_PROVIDER, LLM_PROVIDER } from "./providers/types";
import { LocalEmbeddingProvider } from "./providers/local-embedding.provider";
import { OpenAIEmbeddingProvider } from "./providers/openai-embedding.provider";
import { LocalLlmProvider } from "./providers/local-llm.provider";
import { OpenAILlmProvider } from "./providers/openai-llm.provider";
import { AnthropicLlmProvider } from "./providers/anthropic-llm.provider";

const logger = new Logger("AiModule");

/**
 * Provider selection is key-driven so the stack runs offline by default.
 * Embeddings need OpenAI (Anthropic exposes no embeddings endpoint), while
 * text generation can use either vendor.
 */
const embeddingProvider = {
  provide: EMBEDDING_PROVIDER,
  useFactory: () => {
    const key = process.env.OPENAI_API_KEY?.trim();
    if (key) {
      logger.log("Embeddings: OpenAI");
      return new OpenAIEmbeddingProvider(key);
    }
    logger.log("Embeddings: local hashing model (set OPENAI_API_KEY for hosted embeddings)");
    return new LocalEmbeddingProvider();
  },
};

const llmProvider = {
  provide: LLM_PROVIDER,
  useFactory: () => {
    const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
    const openaiKey = process.env.OPENAI_API_KEY?.trim();
    const preferred = process.env.AI_LLM_PROVIDER?.trim().toLowerCase();

    if (anthropicKey && (preferred === "anthropic" || !openaiKey)) {
      logger.log("LLM: Anthropic (Claude)");
      return new AnthropicLlmProvider(anthropicKey);
    }
    if (openaiKey) {
      logger.log("LLM: OpenAI");
      return new OpenAILlmProvider(openaiKey);
    }
    logger.log("LLM: deterministic template fallback (no API key configured)");
    return new LocalLlmProvider();
  },
};

@Module({
  controllers: [AiController],
  providers: [AiService, EmbeddingsService, ParsingService, embeddingProvider, llmProvider],
  exports: [AiService, EmbeddingsService, LLM_PROVIDER],
})
export class AiModule {}
