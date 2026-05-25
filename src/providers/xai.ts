import type { ProviderConfig, ProviderName } from "../types/index.js";
import { BaseOpenAIProvider } from "./base.js";

/**
 * xAI (Grok) provider - OpenAI-compatible API.
 */
export class XAIProvider extends BaseOpenAIProvider {
  readonly name: ProviderName = "xai";

  constructor(config: ProviderConfig) {
    super(config);
  }
}
