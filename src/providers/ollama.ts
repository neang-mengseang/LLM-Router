import type { ProviderConfig, ProviderName } from "../types/index.js";
import { BaseOpenAIProvider } from "./base.js";

/**
 * Ollama provider - local OpenAI-compatible API.
 * No API key required.
 */
export class OllamaProvider extends BaseOpenAIProvider {
  readonly name: ProviderName = "ollama";

  constructor(config: ProviderConfig) {
    super(config);
  }

  protected getHeaders(): Record<string, string> {
    return {};
  }
}
