import type { FastifyRequest, FastifyReply } from "fastify";
import type { AuthConfig } from "../types/index.js";
import { AuthenticationError } from "../utils/errors.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("auth");

/**
 * Creates the API key authentication middleware.
 * Validates the x-api-key header against configured keys.
 */
export function createAuthMiddleware(authConfig: AuthConfig) {
  const validKeys = new Set(authConfig.api_keys.map((k) => k.key));
  const keyNames = new Map(authConfig.api_keys.map((k) => [k.key, k.name]));

  return async function authenticate(request: FastifyRequest, _reply: FastifyReply) {
    const apiKey = request.headers["x-api-key"] as string | undefined;

    if (!apiKey) {
      log.warn({ ip: request.ip }, "Request missing API key");
      throw new AuthenticationError("Missing API key. Provide x-api-key header.");
    }

    if (!validKeys.has(apiKey)) {
      log.warn({ ip: request.ip }, "Request with invalid API key");
      throw new AuthenticationError("Invalid API key.");
    }

    // Attach key name to request for logging
    (request as unknown as { keyName: string }).keyName = keyNames.get(apiKey) || "unknown";
    log.debug({ keyName: keyNames.get(apiKey) }, "Authenticated request");
  };
}
