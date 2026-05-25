import type { ProviderConfig, ProviderName } from "../types/index.js";
import { BaseOpenAIProvider } from "./base.js";

/**
 * DeepSeek provider - OpenAI-compatible API.
 */
export class DeepSeekProvider extends BaseOpenAIProvider {
  readonly name: ProviderName = "deepseek";

  constructor(config: ProviderConfig) {
    super(config);
  }
}
