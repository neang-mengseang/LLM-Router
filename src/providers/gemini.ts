import type { ProviderConfig, ProviderName } from "../types/index.js";
import { BaseOpenAIProvider } from "./base.js";

/**
 * Google Gemini provider via AI Studio's OpenAI-compatible endpoint.
 */
export class GeminiProvider extends BaseOpenAIProvider {
  readonly name: ProviderName = "gemini";

  constructor(config: ProviderConfig) {
    super(config);
  }

  protected getChatUrl(): string {
    return `${this.config.base_url}/openai/chat/completions`;
  }

  protected getHeaders(): Record<string, string> {
    return {
      authorization: `Bearer ${this.config.api_key}`,
    };
  }
}
