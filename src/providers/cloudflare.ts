import type { ProviderConfig, ProviderName } from "../types/index.js";
import { BaseOpenAIProvider } from "./base.js";

/**
 * Cloudflare Workers AI provider.
 * Uses the OpenAI-compatible endpoint via account-scoped gateway.
 * Requires account_id in config.
 */
export class CloudflareProvider extends BaseOpenAIProvider {
  readonly name: ProviderName = "cloudflare";

  constructor(config: ProviderConfig) {
    super(config);
  }

  isAvailable(): boolean {
    return !!this.config.api_key && !!this.config.account_id;
  }

  protected getChatUrl(): string {
    // Cloudflare Workers AI OpenAI-compatible endpoint
    return `https://api.cloudflare.com/client/v4/accounts/${this.config.account_id}/ai/v1/chat/completions`;
  }

  protected getHeaders(): Record<string, string> {
    return {
      authorization: `Bearer ${this.config.api_key}`,
    };
  }
}
