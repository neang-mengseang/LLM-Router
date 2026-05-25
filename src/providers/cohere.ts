import type { ProviderConfig, ProviderName } from "../types/index.js";
import { BaseOpenAIProvider } from "./base.js";

/**
 * Cohere provider - OpenAI-compatible API (v2 endpoint).
 */
export class CohereProvider extends BaseOpenAIProvider {
  readonly name: ProviderName = "cohere";

  constructor(config: ProviderConfig) {
    super(config);
  }

  protected getHeaders(): Record<string, string> {
    return {
      authorization: `Bearer ${this.config.api_key}`,
    };
  }
}
