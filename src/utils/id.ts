import { randomBytes } from "node:crypto";

/**
 * Generates a unique ID for chat completion responses.
 * Format: chatcmpl-<random hex string>
 */
export function generateCompletionId(): string {
  return `chatcmpl-${randomBytes(12).toString("hex")}`;
}
