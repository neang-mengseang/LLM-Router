import type { ProviderConfig, ProviderName } from "../types/index.js";
import { BaseOpenAIProvider } from "./base.js";

/**
 * Cerebras provider - OpenAI-compatible API.
 */
export class CerebrasProvider extends BaseOpenAIProvider {
  readonly name: ProviderName = "cerebras";

  constructor(config: ProviderConfig) {
    super(config);
  }
}
