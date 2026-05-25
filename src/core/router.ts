import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ModelMapping,
  ProviderName,
  ProviderRequestOptions,
  AppConfig,
} from "../types/index.js";
import { CircuitBreaker } from "./circuitBreaker.js";
import { ProviderRegistry } from "../providers/index.js";
import { AllProvidersFailedError, ModelNotFoundError, isRetryableError } from "../utils/errors.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("router");

/**
 * The core failover router engine.
 * Resolves virtual models and routes requests through providers sequentially
 * until one succeeds or all fail.
 */
export class Router {
  private config: AppConfig;
  private providers: ProviderRegistry;
  private circuitBreaker: CircuitBreaker;

  constructor(config: AppConfig) {
    this.config = config;
    this.providers = new ProviderRegistry(config.providers);
    this.circuitBreaker = new CircuitBreaker(config.circuit_breaker);
  }

  /**
   * Route a non-streaming chat completion request.
   */
  async chat(request: ChatCompletionRequest): Promise<{
    response: ChatCompletionResponse;
    provider: ProviderName;
    model: string;
    attempts: number;
  }> {
    const mappings = this.resolveModel(request.model);
    const attempts: Array<{ provider: ProviderName; model: string; error: string; status?: number }> = [];

    for (const mapping of mappings) {
      // Skip providers in cooldown
      if (!this.circuitBreaker.isAvailable(mapping.provider)) {
        log.debug({ provider: mapping.provider }, "Skipping provider (cooldown)");
        continue;
      }

      // Skip providers without credentials
      if (!this.providers.has(mapping.provider)) {
        log.debug({ provider: mapping.provider }, "Skipping provider (not available)");
        continue;
      }

      const provider = this.providers.get(mapping.provider)!;
      const options = this.buildOptions(request);

      try {
        log.info(
          { provider: mapping.provider, model: mapping.model, virtualModel: request.model },
          "Attempting provider"
        );

        const response = await provider.chat(mapping.model, request.messages, options);
        this.circuitBreaker.recordSuccess(mapping.provider);

        log.info(
          { provider: mapping.provider, model: mapping.model, attempts: attempts.length + 1 },
          "Request succeeded"
        );

        return {
          response,
          provider: mapping.provider,
          model: mapping.model,
          attempts: attempts.length + 1,
        };
      } catch (err) {
        const error = err as Error;
        const errorMsg = error.message || "Unknown error";

        attempts.push({
          provider: mapping.provider,
          model: mapping.model,
          error: errorMsg,
          status: "statusCode" in error ? (error as { statusCode: number }).statusCode : undefined,
        });

        if (isRetryableError(err)) {
          this.circuitBreaker.recordFailure(mapping.provider, errorMsg);
          log.warn(
            { provider: mapping.provider, error: errorMsg },
            "Provider failed, trying next"
          );
        } else {
          // Non-retryable error (e.g., 400 Bad Request) - don't failover
          log.error(
            { provider: mapping.provider, error: errorMsg },
            "Non-retryable error, stopping"
          );
          throw err;
        }
      }
    }

    throw new AllProvidersFailedError(request.model, attempts);
  }

  /**
   * Route a streaming chat completion request.
   */
  async chatStream(request: ChatCompletionRequest): Promise<{
    stream: ReadableStream<Uint8Array>;
    provider: ProviderName;
    model: string;
    attempts: number;
  }> {
    const mappings = this.resolveModel(request.model);
    const attempts: Array<{ provider: ProviderName; model: string; error: string; status?: number }> = [];

    for (const mapping of mappings) {
      if (!this.circuitBreaker.isAvailable(mapping.provider)) {
        log.debug({ provider: mapping.provider }, "Skipping provider (cooldown)");
        continue;
      }

      if (!this.providers.has(mapping.provider)) {
        log.debug({ provider: mapping.provider }, "Skipping provider (not available)");
        continue;
      }

      const provider = this.providers.get(mapping.provider)!;
      const options = this.buildOptions(request);

      try {
        log.info(
          { provider: mapping.provider, model: mapping.model, virtualModel: request.model },
          "Attempting provider (stream)"
        );

        const stream = await provider.chatStream(mapping.model, request.messages, options);
        this.circuitBreaker.recordSuccess(mapping.provider);

        log.info(
          { provider: mapping.provider, model: mapping.model, attempts: attempts.length + 1 },
          "Stream request succeeded"
        );

        return {
          stream,
          provider: mapping.provider,
          model: mapping.model,
          attempts: attempts.length + 1,
        };
      } catch (err) {
        const error = err as Error;
        const errorMsg = error.message || "Unknown error";

        attempts.push({
          provider: mapping.provider,
          model: mapping.model,
          error: errorMsg,
          status: "statusCode" in error ? (error as { statusCode: number }).statusCode : undefined,
        });

        if (isRetryableError(err)) {
          this.circuitBreaker.recordFailure(mapping.provider, errorMsg);
          log.warn(
            { provider: mapping.provider, error: errorMsg },
            "Provider stream failed, trying next"
          );
        } else {
          log.error(
            { provider: mapping.provider, error: errorMsg },
            "Non-retryable stream error, stopping"
          );
          throw err;
        }
      }
    }

    throw new AllProvidersFailedError(request.model, attempts);
  }

  /**
   * Call a specific provider directly (bypasses failover).
   * Useful for testing individual providers.
   */
  async chatDirect(
    providerName: ProviderName,
    model: string,
    request: ChatCompletionRequest
  ): Promise<ChatCompletionResponse> {
    if (!this.providers.has(providerName)) {
      throw new ModelNotFoundError(`Provider '${providerName}' is not available`);
    }

    const provider = this.providers.get(providerName)!;
    const options = this.buildOptions(request);

    log.info({ provider: providerName, model }, "Direct provider call");
    const response = await provider.chat(model, request.messages, options);
    this.circuitBreaker.recordSuccess(providerName);
    return response;
  }

  /**
   * Call a specific provider directly with streaming.
   */
  async chatStreamDirect(
    providerName: ProviderName,
    model: string,
    request: ChatCompletionRequest
  ): Promise<ReadableStream<Uint8Array>> {
    if (!this.providers.has(providerName)) {
      throw new ModelNotFoundError(`Provider '${providerName}' is not available`);
    }

    const provider = this.providers.get(providerName)!;
    const options = this.buildOptions(request);

    log.info({ provider: providerName, model }, "Direct provider stream call");
    const stream = await provider.chatStream(model, request.messages, options);
    this.circuitBreaker.recordSuccess(providerName);
    return stream;
  }

  /**
   * Get list of available (configured) providers.
   */
  getAvailableProviders(): ProviderName[] {
    return this.providers.getAvailableProviders();
  }

  /**
   * Get the health status of all providers.
   */
  getHealthStatus() {
    return this.circuitBreaker.getAllHealth();
  }

  /**
   * Get available virtual models.
   */
  getModels(): string[] {
    return Object.keys(this.config.models);
  }

  /**
   * Resolve a virtual model name to its provider mappings.
   */
  private resolveModel(model: string): ModelMapping[] {
    const mappings = this.config.models[model];
    if (!mappings) {
      throw new ModelNotFoundError(model);
    }
    return mappings;
  }

  /**
   * Build provider request options from the chat completion request.
   */
  private buildOptions(request: ChatCompletionRequest): ProviderRequestOptions {
    return {
      temperature: request.temperature,
      top_p: request.top_p,
      max_tokens: request.max_tokens,
      stop: request.stop,
      timeout_ms: this.config.request.timeout_ms,
    };
  }
}
