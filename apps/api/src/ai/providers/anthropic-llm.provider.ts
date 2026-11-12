import { Logger } from "@nestjs/common";
import { LlmProvider } from "./types";
import { LocalLlmProvider } from "./local-llm.provider";

type MessagesResponse = {
  content: { type: string; text?: string }[];
};

export class AnthropicLlmProvider implements LlmProvider {
  readonly name = "anthropic";
  private readonly logger = new Logger(AnthropicLlmProvider.name);
  private readonly fallback = new LocalLlmProvider();

  constructor(
    private readonly apiKey: string,
    readonly model = process.env.AI_LLM_MODEL ?? "claude-sonnet-4-20250514",
    private readonly baseUrl = process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com/v1",
  ) {}

  async complete({
    system,
    prompt,
    maxTokens = 600,
  }: {
    system: string;
    prompt: string;
    maxTokens?: number;
  }) {
    try {
      const response = await fetch(`${this.baseUrl}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: maxTokens,
          temperature: 0.3,
          system,
          messages: [{ role: "user", content: prompt }],
        }),
        signal: AbortSignal.timeout(45_000),
      });

      if (!response.ok) {
        throw new Error(`Anthropic ${response.status}: ${await response.text()}`);
      }

      const payload = (await response.json()) as MessagesResponse;
      const text = payload.content
        ?.filter((block) => block.type === "text")
        .map((block) => block.text ?? "")
        .join("")
        .trim();
      if (!text) throw new Error("Empty completion");
      return text;
    } catch (error) {
      this.logger.warn(
        `Anthropic completion failed, using template fallback: ${
          error instanceof Error ? error.message : error
        }`,
      );
      return this.fallback.complete({ system, prompt, maxTokens });
    }
  }
}
