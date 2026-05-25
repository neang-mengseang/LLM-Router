import type { ProviderConfig, ProviderName } from "../types/index.js";
import { BaseOpenAIProvider } from "./base.js";

/**
 * Together AI provider - OpenAI-compatible API.
 */
export class TogetherProvider extends BaseOpenAIProvider {
  readonly name: ProviderName = "together";

  constructor(config: ProviderConfig) {
    super(config);
  }
}
