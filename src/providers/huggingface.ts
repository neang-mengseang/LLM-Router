import type {
  ChatMessage,
  ChatCompletionResponse,
  ProviderConfig,
  ProviderName,
  ProviderRequestOptions,
} from "../types/index.js";
import { BaseOpenAIProvider } from "./base.js";
import { generateCompletionId } from "../utils/id.js";

/**
 * Hugging Face Inference API provider.
 * Uses the /v1/chat/completions endpoint for compatible models.
 */
export class HuggingFaceProvider extends BaseOpenAIProvider {
  readonly name: ProviderName = "huggingface";

  constructor(config: ProviderConfig) {
    super(config);
  }

  protected getChatUrl(): string {
    return `${this.config.base_url || ""}/v1/chat/completions`;
  }

  protected getHeaders(): Record<string, string> {
    return {
      authorization: `Bearer ${this.config.api_key}`,
    };
  }

  protected buildRequestBody(
    model: string,
    messages: ChatMessage[],
    options: ProviderRequestOptions,
    stream: boolean
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model,
      messages,
      stream,
    };

    if (options.temperature !== undefined) body.temperature = options.temperature;
    if (options.top_p !== undefined) body.top_p = options.top_p;
    if (options.max_tokens !== undefined) body.max_tokens = options.max_tokens;

    return body;
  }

  protected normalizeResponse(
    data: ChatCompletionResponse,
    model: string
  ): ChatCompletionResponse {
    // Ensure the response has all required fields
    return {
      id: data.id || generateCompletionId(),
      object: "chat.completion",
      created: data.created || Math.floor(Date.now() / 1000),
      model: data.model || model,
      choices: data.choices,
      usage: data.usage,
    };
  }
}
