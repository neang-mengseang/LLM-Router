import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { configSchema } from "./schema.js";
import type { AppConfig } from "../types/index.js";
import { logger } from "../utils/logger.js";

/**
 * Loads and validates the YAML configuration file.
 */
export function loadConfig(configPath?: string): AppConfig {
  const resolvedPath = configPath || resolve(process.cwd(), "config.yaml");

  if (!existsSync(resolvedPath)) {
    logger.fatal(
      { path: resolvedPath },
      "Configuration file not found. Copy config.example.yaml to config.yaml and fill in your settings."
    );
    process.exit(1);
  }

  let rawContent: string;
  try {
    rawContent = readFileSync(resolvedPath, "utf-8");
  } catch (err) {
    logger.fatal({ err, path: resolvedPath }, "Failed to read configuration file");
    process.exit(1);
  }

  let parsed: unknown;
  try {
    parsed = parse(rawContent);
  } catch (err) {
    logger.fatal({ err }, "Failed to parse YAML configuration");
    process.exit(1);
  }

  const result = configSchema.safeParse(parsed);

  if (!result.success) {
    logger.fatal(
      { errors: result.error.flatten().fieldErrors },
      "Configuration validation failed"
    );
    process.exit(1);
  }

  logger.info(
    {
      providers: Object.keys(result.data.providers).length,
      models: Object.keys(result.data.models).length,
      apiKeys: result.data.auth.api_keys.length,
    },
    "Configuration loaded successfully"
  );

  return result.data as AppConfig;
}
