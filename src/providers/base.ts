import { request } from "undici";
import type {
  ChatMessage,
  ChatCompletionResponse,
  ProviderAdapter,
  ProviderConfig,
  ProviderName,
  ProviderRequestOptions,
} from "../types/index.js";
import { ProviderError, isRetryableStatus } from "../utils/errors.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("provider-base");

/**
 * Base class for OpenAI-compatible providers.
 * Most providers follow the same API shape, so this handles the common logic.
 */
export abstract class BaseOpenAIProvider implements ProviderAdapter {
  abstract readonly name: ProviderName;
  protected config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  isAvailable(): boolean {
    // Ollama doesn't need an API key
    if (this.name === "ollama") return true;
    return !!this.config.api_key;
  }

  async chat(
    model: string,
    messages: ChatMessage[],
    options: ProviderRequestOptions
  ): Promise<ChatCompletionResponse> {
    const url = this.getChatUrl();
    const headers = this.getHeaders();
    const body = this.buildRequestBody(model, messages, options, false);

    log.debug({ provider: this.name, model, url }, "Sending chat request");

    try {
      const response = await request(url, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(options.timeout_ms),
      });

      if (response.statusCode !== 200) {
        const errorBody = await response.body.text();
        const retryable = isRetryableStatus(response.statusCode);
        throw new ProviderError(
          `Provider ${this.name} returned ${response.statusCode}: ${errorBody.slice(0, 200)}`,
          response.statusCode,
          this.name,
          retryable
        );
      }

      const data = (await response.body.json()) as ChatCompletionResponse;
      return this.normalizeResponse(data, model);
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      throw new ProviderError(
        `Provider ${this.name} request failed: ${(err as Error).message}`,
        0,
        this.name,
        true
      );
    }
  }

  async chatStream(
    model: string,
    messages: ChatMessage[],
    options: ProviderRequestOptions
  ): Promise<ReadableStream<Uint8Array>> {
    const url = this.getChatUrl();
    const headers = this.getHeaders();
    const body = this.buildRequestBody(model, messages, options, true);

    log.debug({ provider: this.name, model, url }, "Sending streaming chat request");

    try {
      const response = await request(url, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(options.timeout_ms),
      });

      if (response.statusCode !== 200) {
        const errorBody = await response.body.text();
        const retryable = isRetryableStatus(response.statusCode);
        throw new ProviderError(
          `Provider ${this.name} returned ${response.statusCode}: ${errorBody.slice(0, 200)}`,
          response.statusCode,
          this.name,
          retryable
        );
      }

      // Convert the Node.js readable stream to a web ReadableStream
      const nodeStream = response.body;
      return new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            for await (const chunk of nodeStream) {
              controller.enqueue(chunk instanceof Uint8Array ? chunk : new TextEncoder().encode(String(chunk)));
            }
            controller.close();
          } catch (err) {
            controller.error(err);
          }
        },
      });
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      throw new ProviderError(
        `Provider ${this.name} stream failed: ${(err as Error).message}`,
        0,
        this.name,
        true
      );
    }
  }

  /**
   * Get the chat completions endpoint URL.
   */
  protected getChatUrl(): string {
    return `${this.config.base_url || ""}/chat/completions`;
  }

  /**
   * Get the authorization headers for the provider.
   */
  protected getHeaders(): Record<string, string> {
    return {
      authorization: `Bearer ${this.config.api_key}`,
    };
  }

  /**
   * Build the request body. Override in subclasses for provider-specific formats.
   */
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
    if (options.stop !== undefined) body.stop = options.stop;

    return body;
  }

  /**
   * Normalize the response to ensure consistent format.
   * Override in subclasses if the provider returns a different shape.
   */
  protected normalizeResponse(
    data: ChatCompletionResponse,
    _model: string
  ): ChatCompletionResponse {
    return data;
  }
}
