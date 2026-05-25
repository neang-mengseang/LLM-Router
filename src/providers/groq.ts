import type { ProviderConfig, ProviderName } from "../types/index.js";
import { BaseOpenAIProvider } from "./base.js";

/**
 * Groq provider - OpenAI-compatible API.
 */
export class GroqProvider extends BaseOpenAIProvider {
  readonly name: ProviderName = "groq";

  constructor(config: ProviderConfig) {
    super(config);
  }
}
