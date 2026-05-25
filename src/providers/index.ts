import type { ProviderAdapter, ProviderConfig, ProviderName } from "../types/index.js";
import { GeminiProvider } from "./gemini.js";
import { GroqProvider } from "./groq.js";
import { OpenRouterProvider } from "./openrouter.js";
import { MistralProvider } from "./mistral.js";
import { CerebrasProvider } from "./cerebras.js";
import { TogetherProvider } from "./together.js";
import { NvidiaProvider } from "./nvidia.js";
import { HuggingFaceProvider } from "./huggingface.js";
import { AWSProvider } from "./aws.js";
import { OllamaProvider } from "./ollama.js";
import { CloudflareProvider } from "./cloudflare.js";
import { DeepSeekProvider } from "./deepseek.js";
import { XAIProvider } from "./xai.js";
import { CohereProvider } from "./cohere.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("providers");

/**
 * Factory that creates provider adapter instances from configuration.
 */
export class ProviderRegistry {
  private providers: Map<ProviderName, ProviderAdapter> = new Map();

  constructor(configs: Record<string, ProviderConfig>) {
    this.initializeProviders(configs);
  }

  /**
   * Get a provider adapter by name.
   */
  get(name: ProviderName): ProviderAdapter | undefined {
    return this.providers.get(name);
  }

  /**
   * Check if a provider is configured and available.
   */
  has(name: ProviderName): boolean {
    const provider = this.providers.get(name);
    return provider !== undefined && provider.isAvailable();
  }

  /**
   * Get all available provider names.
   */
  getAvailableProviders(): ProviderName[] {
    return Array.from(this.providers.entries())
      .filter(([_, provider]) => provider.isAvailable())
      .map(([name]) => name);
  }

  private initializeProviders(configs: Record<string, ProviderConfig>): void {
    const factories: Record<string, (config: ProviderConfig) => ProviderAdapter> = {
      gemini: (c) => new GeminiProvider(c),
      groq: (c) => new GroqProvider(c),
      openrouter: (c) => new OpenRouterProvider(c),
      mistral: (c) => new MistralProvider(c),
      cerebras: (c) => new CerebrasProvider(c),
      together: (c) => new TogetherProvider(c),
      nvidia: (c) => new NvidiaProvider(c),
      huggingface: (c) => new HuggingFaceProvider(c),
      aws: (c) => new AWSProvider(c),
      ollama: (c) => new OllamaProvider(c),
      cloudflare: (c) => new CloudflareProvider(c),
      deepseek: (c) => new DeepSeekProvider(c),
      xai: (c) => new XAIProvider(c),
      cohere: (c) => new CohereProvider(c),
    };

    for (const [name, config] of Object.entries(configs)) {
      const factory = factories[name];
      if (factory) {
        const provider = factory(config);
        this.providers.set(name as ProviderName, provider);

        if (provider.isAvailable()) {
          log.info({ provider: name }, "Provider initialized");
        } else {
          log.warn({ provider: name }, "Provider configured but missing credentials");
        }
      } else {
        log.warn({ provider: name }, "Unknown provider in configuration, skipping");
      }
    }
  }
}
