import type { FastifyInstance } from "fastify";
import type { ChatCompletionRequest, ProviderName } from "../types/index.js";
import { Router } from "../core/router.js";
import { RouterError } from "../utils/errors.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("routes");

/**
 * Register all API routes on the Fastify instance.
 */
export function registerRoutes(app: FastifyInstance, router: Router): void {
  /**
   * POST /v1/chat/completions
   * OpenAI-compatible chat completions endpoint.
   */
  app.post<{ Body: ChatCompletionRequest }>(
    "/v1/chat/completions",
    async (request, reply) => {
      const body = request.body;
      const keyName = (request as unknown as { keyName: string }).keyName;

      log.info(
        { model: body.model, stream: body.stream || false, keyName },
        "Chat completion request"
      );

      // Validate required fields
      if (!body.model) {
        return reply.status(400).send({
          error: {
            message: "Missing required field: model",
            type: "invalid_request_error",
            code: "missing_field",
          },
        });
      }

      if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
        return reply.status(400).send({
          error: {
            message: "Missing required field: messages (must be a non-empty array)",
            type: "invalid_request_error",
            code: "missing_field",
          },
        });
      }

      // Handle streaming
      if (body.stream) {
        try {
          const result = await router.chatStream(body);

          reply.raw.writeHead(200, {
            "content-type": "text/event-stream",
            "cache-control": "no-cache",
            connection: "keep-alive",
            "x-llm-router-provider": result.provider,
            "x-llm-router-model": result.model,
            "x-llm-router-attempts": String(result.attempts),
          });

          const reader = result.stream.getReader();

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              reply.raw.write(value);
            }
          } finally {
            reader.releaseLock();
            reply.raw.end();
          }

          return;
        } catch (err) {
          if (err instanceof RouterError) {
            return reply.status(err.statusCode).send({
              error: {
                message: err.message,
                type: "router_error",
                code: err.code,
              },
            });
          }
          throw err;
        }
      }

      // Non-streaming
      try {
        const result = await router.chat(body);

        reply.header("x-llm-router-provider", result.provider);
        reply.header("x-llm-router-model", result.model);
        reply.header("x-llm-router-attempts", String(result.attempts));

        return result.response;
      } catch (err) {
        if (err instanceof RouterError) {
          return reply.status(err.statusCode).send({
            error: {
              message: err.message,
              type: "router_error",
              code: err.code,
              ...(("attempts" in err) ? { attempts: (err as { attempts: unknown }).attempts } : {}),
            },
          });
        }
        throw err;
      }
    }
  );

  /**
   * POST /v1/providers/:provider/chat/completions
   * Direct provider call - bypasses failover routing.
   * Useful for testing individual providers.
   */
  app.post<{
    Params: { provider: string };
    Body: ChatCompletionRequest;
  }>(
    "/v1/providers/:provider/chat/completions",
    async (request, reply) => {
      const { provider } = request.params;
      const body = request.body;

      log.info({ provider, model: body.model, stream: body.stream || false }, "Direct provider request");

      // Validate provider name
      const validProviders: ProviderName[] = [
        "gemini", "groq", "openrouter", "mistral", "cerebras",
        "together", "nvidia", "huggingface", "aws", "ollama",
        "cloudflare", "deepseek", "xai", "cohere",
      ];

      if (!validProviders.includes(provider as ProviderName)) {
        return reply.status(400).send({
          error: {
            message: `Invalid provider '${provider}'. Valid providers: ${validProviders.join(", ")}`,
            type: "invalid_request_error",
            code: "invalid_provider",
          },
        });
      }

      if (!body.model) {
        return reply.status(400).send({
          error: {
            message: "Missing required field: model",
            type: "invalid_request_error",
            code: "missing_field",
          },
        });
      }

      if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
        return reply.status(400).send({
          error: {
            message: "Missing required field: messages (must be a non-empty array)",
            type: "invalid_request_error",
            code: "missing_field",
          },
        });
      }

      const providerName = provider as ProviderName;

      // Handle streaming
      if (body.stream) {
        try {
          const stream = await router.chatStreamDirect(providerName, body.model, body);

          reply.raw.writeHead(200, {
            "content-type": "text/event-stream",
            "cache-control": "no-cache",
            connection: "keep-alive",
            "x-llm-router-provider": providerName,
            "x-llm-router-model": body.model,
          });

          const reader = stream.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              reply.raw.write(value);
            }
          } finally {
            reader.releaseLock();
            reply.raw.end();
          }
          return;
        } catch (err) {
          if (err instanceof RouterError) {
            return reply.status(err.statusCode).send({
              error: { message: err.message, type: "router_error", code: err.code },
            });
          }
          const error = err as Error;
          return reply.status(502).send({
            error: {
              message: error.message,
              type: "provider_error",
              code: "provider_failed",
              provider: providerName,
            },
          });
        }
      }

      // Non-streaming
      try {
        const response = await router.chatDirect(providerName, body.model, body);

        reply.header("x-llm-router-provider", providerName);
        reply.header("x-llm-router-model", body.model);

        return response;
      } catch (err) {
        if (err instanceof RouterError) {
          return reply.status(err.statusCode).send({
            error: { message: err.message, type: "router_error", code: err.code },
          });
        }
        const error = err as Error;
        return reply.status(502).send({
          error: {
            message: error.message,
            type: "provider_error",
            code: "provider_failed",
            provider: providerName,
          },
        });
      }
    }
  );

  /**
   * GET /v1/providers
   * List available providers and their status.
   */
  app.get("/v1/providers", async (_request, _reply) => {
    const available = router.getAvailableProviders();
    const health = router.getHealthStatus();

    return {
      object: "list",
      data: available.map((name) => {
        const h = health.find((p) => p.provider === name);
        return {
          id: name,
          status: h?.status || "healthy",
          fail_count: h?.fail_count || 0,
        };
      }),
    };
  });

  /**
   * GET /v1/models
   * List available virtual models.
   */
  app.get("/v1/models", async (_request, _reply) => {
    const models = router.getModels();
    return {
      object: "list",
      data: models.map((id) => ({
        id,
        object: "model",
        created: Math.floor(Date.now() / 1000),
        owned_by: "llm-router",
      })),
    };
  });

  /**
   * GET /health
   * Health check endpoint with provider status.
   */
  app.get("/health", async (_request, _reply) => {
    const providers = router.getHealthStatus();
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      providers,
    };
  });

  /**
   * GET /
   * Root endpoint - basic info.
   */
  app.get("/", async (_request, _reply) => {
    return {
      name: "llm-router",
      version: "1.0.0",
      description: "OpenAI-compatible LLM routing engine with multi-provider failover",
      endpoints: {
        chat: "POST /v1/chat/completions",
        models: "GET /v1/models",
        providers: "GET /v1/providers",
        direct: "POST /v1/providers/:provider/chat/completions",
        health: "GET /health",
      },
    };
  });
}
