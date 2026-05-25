import type { ProviderConfig, ProviderName } from "../types/index.js";
import { BaseOpenAIProvider } from "./base.js";

/**
 * OpenRouter provider - OpenAI-compatible API with model routing.
 */
export class OpenRouterProvider extends BaseOpenAIProvider {
  readonly name: ProviderName = "openrouter";

  constructor(config: ProviderConfig) {
    super(config);
  }

  protected getHeaders(): Record<string, string> {
    return {
      authorization: `Bearer ${this.config.api_key}`,
      "x-title": "LLM Router",
    };
  }
}
