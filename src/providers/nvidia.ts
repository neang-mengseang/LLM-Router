import type { ProviderConfig, ProviderName } from "../types/index.js";
import { BaseOpenAIProvider } from "./base.js";

/**
 * NVIDIA NIM / Cloud API provider - OpenAI-compatible API.
 */
export class NvidiaProvider extends BaseOpenAIProvider {
  readonly name: ProviderName = "nvidia";

  constructor(config: ProviderConfig) {
    super(config);
  }
}
