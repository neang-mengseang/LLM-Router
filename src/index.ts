import { loadConfig } from "./config/loader.js";
import { startServer } from "./server/app.js";
import { logger } from "./utils/logger.js";

/**
 * LLM Router - Entry Point
 *
 * A self-hosted, OpenAI-compatible LLM routing engine
 * with multi-provider failover support.
 */
async function main(): Promise<void> {
  logger.info("Starting LLM Router...");

  // Load configuration
  const configPath = process.env.CONFIG_PATH || undefined;
  const config = loadConfig(configPath);

  // Start the server
  await startServer(config);
}

main().catch((err) => {
  logger.fatal({ err }, "Fatal error during startup");
  process.exit(1);
});
