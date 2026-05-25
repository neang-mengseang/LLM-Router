import { z } from "zod";

/**
 * Zod schemas for config validation
 */

const apiKeySchema = z.object({
  key: z.string().min(1, "API key cannot be empty"),
  name: z.string().min(1, "API key name cannot be empty"),
});

const authSchema = z.object({
  api_keys: z.array(apiKeySchema).min(1, "At least one API key is required"),
});

const serverSchema = z.object({
  port: z.number().int().min(1).max(65535).default(4000),
  host: z.string().default("0.0.0.0"),
});

const providerConfigSchema = z.object({
  api_key: z.string().optional(),
  base_url: z.string().url("Invalid provider base URL").optional(),
  access_key_id: z.string().optional(),
  secret_access_key: z.string().optional(),
  region: z.string().optional(),
  account_id: z.string().optional(),
});

const providerNameSchema = z.enum([
  "gemini",
  "groq",
  "openrouter",
  "mistral",
  "cerebras",
  "together",
  "nvidia",
  "huggingface",
  "aws",
  "ollama",
  "cloudflare",
  "deepseek",
  "xai",
  "cohere",
]);

const modelMappingSchema = z.object({
  provider: providerNameSchema,
  model: z.string().min(1),
});

const circuitBreakerSchema = z.object({
  failure_threshold: z.number().int().min(1).default(3),
  cooldown_seconds: z.number().int().min(1).default(600),
  success_threshold: z.number().int().min(1).default(2),
});

const requestSchema = z.object({
  timeout_ms: z.number().int().min(1000).default(30000),
});

export const configSchema = z.object({
  server: serverSchema.default({ port: 4000, host: "0.0.0.0" }),
  auth: authSchema,
  providers: z.record(z.string(), providerConfigSchema),
  models: z.record(z.string(), z.array(modelMappingSchema).min(1)),
  circuit_breaker: circuitBreakerSchema.default({
    failure_threshold: 3,
    cooldown_seconds: 600,
    success_threshold: 2,
  }),
  request: requestSchema.default({ timeout_ms: 30000 }),
});

export type ValidatedConfig = z.infer<typeof configSchema>;
