import Fastify from "fastify";
import type { AppConfig } from "../types/index.js";
import { Router } from "../core/router.js";
import { createAuthMiddleware } from "./middleware.js";
import { registerRoutes } from "./routes.js";
import { RouterError } from "../utils/errors.js";
import { logger, createLogger } from "../utils/logger.js";

const log = createLogger("server");

/**
 * Creates and configures the Fastify application.
 */
export function createApp(config: AppConfig) {
  const app = Fastify({
    logger: false, // We use our own pino logger
    trustProxy: true,
  });

  // Global error handler
  app.setErrorHandler((error: Error, _request, reply) => {
    if (error instanceof RouterError) {
      return reply.status(error.statusCode).send({
        error: {
          message: error.message,
          type: "router_error",
          code: error.code,
        },
      });
    }

    // Fastify validation errors
    if ("validation" in error && (error as { validation: unknown }).validation) {
      return reply.status(400).send({
        error: {
          message: error.message,
          type: "invalid_request_error",
          code: "validation_error",
        },
      });
    }

    log.error({ err: error }, "Unhandled error");
    return reply.status(500).send({
      error: {
        message: "Internal server error",
        type: "server_error",
        code: "internal_error",
      },
    });
  });

  // Auth middleware for /v1/* routes
  const authenticate = createAuthMiddleware(config.auth);
  app.addHook("onRequest", async (request, reply) => {
    // Skip auth for health check and root
    if (request.url === "/health" || request.url === "/") {
      return;
    }
    await authenticate(request, reply);
  });

  // Request logging
  app.addHook("onResponse", async (request, reply) => {
    log.info(
      {
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        responseTime: reply.elapsedTime,
      },
      "Request completed"
    );
  });

  // Initialize router and register routes
  const router = new Router(config);
  registerRoutes(app, router);

  return app;
}

/**
 * Start the server.
 */
export async function startServer(config: AppConfig): Promise<void> {
  const app = createApp(config);

  try {
    await app.listen({ port: config.server.port, host: config.server.host });
    logger.info(
      { port: config.server.port, host: config.server.host },
      `LLM Router started on http://${config.server.host}:${config.server.port}`
    );
  } catch (err) {
    logger.fatal({ err }, "Failed to start server");
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down...");
    await app.close();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}
