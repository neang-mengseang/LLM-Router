/**
 * Custom error classes for the LLM Router.
 */

export class RouterError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.name = "RouterError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class AuthenticationError extends RouterError {
  constructor(message = "Invalid or missing API key") {
    super(message, 401, "UNAUTHORIZED");
  }
}

export class ModelNotFoundError extends RouterError {
  constructor(model: string) {
    super(`Model '${model}' not found in configuration`, 404, "MODEL_NOT_FOUND");
  }
}

export class AllProvidersFailedError extends RouterError {
  public readonly attempts: Array<{
    provider: string;
    model: string;
    error: string;
    status?: number;
  }>;

  constructor(
    model: string,
    attempts: Array<{ provider: string; model: string; error: string; status?: number }>
  ) {
    super(
      `All providers failed for model '${model}' after ${attempts.length} attempts`,
      502,
      "ALL_PROVIDERS_FAILED"
    );
    this.attempts = attempts;
  }
}

export class ProviderError extends Error {
  public readonly statusCode: number;
  public readonly provider: string;
  public readonly retryable: boolean;

  constructor(message: string, statusCode: number, provider: string, retryable: boolean) {
    super(message);
    this.name = "ProviderError";
    this.statusCode = statusCode;
    this.provider = provider;
    this.retryable = retryable;
  }
}

/**
 * Determines if an HTTP status code is retryable (should trigger failover).
 */
export function isRetryableStatus(status: number): boolean {
  return (
    status === 401 || // Unauthorized (bad key — skip to next provider)
    status === 402 || // Payment Required (no balance)
    status === 429 || // Rate Limited
    status === 500 || // Internal Server Error
    status === 502 || // Bad Gateway
    status === 503 || // Service Unavailable
    status === 504    // Gateway Timeout
  );
}

/**
 * Determines if an error should trigger failover to the next provider.
 */
export function isRetryableError(err: unknown): boolean {
  if (err instanceof ProviderError) {
    return err.retryable;
  }

  // Network errors are always retryable
  if (err instanceof Error) {
    const networkErrors = ["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "UND_ERR_CONNECT_TIMEOUT"];
    return networkErrors.some((code) => err.message.includes(code));
  }

  return false;
}
