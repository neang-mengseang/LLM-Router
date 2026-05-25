/**
 * Core type definitions for LLM Router
 */

// ─── OpenAI-Compatible Types ───────────────────────────────────────────────────

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  name?: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stream?: boolean;
  stop?: string | string[];
  presence_penalty?: number;
  frequency_penalty?: number;
}

export interface ChatCompletionChoice {
  index: number;
  message: ChatMessage;
  finish_reason: "stop" | "length" | "tool_calls" | null;
}

export interface ChatCompletionUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ChatCompletionResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage?: ChatCompletionUsage;
}

// ─── Streaming Types ───────────────────────────────────────────────────────────

export interface ChatCompletionChunkDelta {
  role?: "assistant";
  content?: string;
}

export interface ChatCompletionChunkChoice {
  index: number;
  delta: ChatCompletionChunkDelta;
  finish_reason: "stop" | "length" | "tool_calls" | null;
}

export interface ChatCompletionChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: ChatCompletionChunkChoice[];
}

// ─── Provider Types ────────────────────────────────────────────────────────────

export type ProviderName =
  | "gemini"
  | "groq"
  | "openrouter"
  | "mistral"
  | "cerebras"
  | "together"
  | "nvidia"
  | "huggingface"
  | "aws"
  | "ollama"
  | "cloudflare"
  | "deepseek"
  | "xai"
  | "cohere";

export interface ProviderConfig {
  api_key?: string;
  base_url?: string;
  access_key_id?: string;
  secret_access_key?: string;
  region?: string;
  account_id?: string;
}

export interface ModelMapping {
  provider: ProviderName;
  model: string;
}

// ─── Provider Health ───────────────────────────────────────────────────────────

export type ProviderStatus = "healthy" | "degraded" | "unhealthy" | "cooldown";

export interface ProviderHealth {
  provider: ProviderName;
  status: ProviderStatus;
  fail_count: number;
  success_count: number;
  cooldown_until: number | null;
  last_error?: string;
  last_success?: number;
}

// ─── Configuration Types ───────────────────────────────────────────────────────

export interface AuthConfig {
  api_keys: Array<{
    key: string;
    name: string;
  }>;
}

export interface ServerConfig {
  port: number;
  host: string;
}

export interface CircuitBreakerConfig {
  failure_threshold: number;
  cooldown_seconds: number;
  success_threshold: number;
}

export interface RequestConfig {
  timeout_ms: number;
}

export interface AppConfig {
  server: ServerConfig;
  auth: AuthConfig;
  providers: Record<string, ProviderConfig>;
  models: Record<string, ModelMapping[]>;
  circuit_breaker: CircuitBreakerConfig;
  request: RequestConfig;
}

// ─── Provider Interface ────────────────────────────────────────────────────────

export interface ProviderAdapter {
  readonly name: ProviderName;

  chat(
    model: string,
    messages: ChatMessage[],
    options: ProviderRequestOptions
  ): Promise<ChatCompletionResponse>;

  chatStream(
    model: string,
    messages: ChatMessage[],
    options: ProviderRequestOptions
  ): Promise<ReadableStream<Uint8Array>>;

  isAvailable(): boolean;
}

export interface ProviderRequestOptions {
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stop?: string | string[];
  timeout_ms: number;
}

// ─── Router Types ──────────────────────────────────────────────────────────────

export interface RouteResult {
  response: ChatCompletionResponse;
  provider: ProviderName;
  model: string;
  attempts: number;
}

export interface RouteStreamResult {
  stream: ReadableStream<Uint8Array>;
  provider: ProviderName;
  model: string;
  attempts: number;
}

export interface RoutingError {
  message: string;
  attempts: Array<{
    provider: ProviderName;
    model: string;
    error: string;
    status?: number;
  }>;
}
