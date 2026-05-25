import type { ProviderConfig, ProviderName } from "../types/index.js";
import { BaseOpenAIProvider } from "./base.js";

/**
 * Mistral AI provider - OpenAI-compatible API.
 */
export class MistralProvider extends BaseOpenAIProvider {
  readonly name: ProviderName = "mistral";

  constructor(config: ProviderConfig) {
    super(config);
  }
}
