import { Logger } from "@nestjs/common";
import { LlmProvider } from "./types";
import { LocalLlmProvider } from "./local-llm.provider";

type ChatResponse = {
  choices: { message: { content: string } }[];
};

export class OpenAILlmProvider implements LlmProvider {
  readonly name = "openai";
  private readonly logger = new Logger(OpenAILlmProvider.name);
  private readonly fallback = new LocalLlmProvider();

  constructor(
    private readonly apiKey: string,
    readonly model = process.env.AI_LLM_MODEL ?? "gpt-4o-mini",
    private readonly baseUrl = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
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
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: maxTokens,
          temperature: 0.3,
          messages: [
            { role: "system", content: system },
            { role: "user", content: prompt },
          ],
        }),
        signal: AbortSignal.timeout(45_000),
      });

      if (!response.ok) {
        throw new Error(`OpenAI ${response.status}: ${await response.text()}`);
      }

      const payload = (await response.json()) as ChatResponse;
      const text = payload.choices?.[0]?.message?.content?.trim();
      if (!text) throw new Error("Empty completion");
      return text;
    } catch (error) {
      this.logger.warn(
        `OpenAI completion failed, using template fallback: ${
          error instanceof Error ? error.message : error
        }`,
      );
      return this.fallback.complete({ system, prompt, maxTokens });
    }
  }
}
