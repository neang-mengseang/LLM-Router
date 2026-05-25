import { createHmac, createHash } from "node:crypto";
import { request } from "undici";
import type {
  ChatMessage,
  ChatCompletionResponse,
  ProviderAdapter,
  ProviderConfig,
  ProviderName,
  ProviderRequestOptions,
} from "../types/index.js";
import { ProviderError, isRetryableStatus } from "../utils/errors.js";
import { generateCompletionId } from "../utils/id.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("provider-aws");

/**
 * AWS Bedrock provider using the Converse API.
 * Uses AWS Signature V4 for authentication.
 */
export class AWSProvider implements ProviderAdapter {
  readonly name: ProviderName = "aws";
  private config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  isAvailable(): boolean {
    return !!this.config.access_key_id && !!this.config.secret_access_key;
  }

  async chat(
    model: string,
    messages: ChatMessage[],
    options: ProviderRequestOptions
  ): Promise<ChatCompletionResponse> {
    const region = this.config.region || "us-east-1";
    const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${model}/converse`;

    const body = this.buildConverseBody(messages, options);
    const bodyStr = JSON.stringify(body);

    const headers = this.signRequest("POST", url, bodyStr, region);

    log.debug({ provider: this.name, model, region }, "Sending AWS Bedrock request");

    try {
      const response = await request(url, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: bodyStr,
        signal: AbortSignal.timeout(options.timeout_ms),
      });

      if (response.statusCode !== 200) {
        const errorBody = await response.body.text();
        const retryable = isRetryableStatus(response.statusCode);
        throw new ProviderError(
          `AWS Bedrock returned ${response.statusCode}: ${errorBody.slice(0, 200)}`,
          response.statusCode,
          this.name,
          retryable
        );
      }

      const data = (await response.body.json()) as Record<string, unknown>;
      return this.normalizeConverseResponse(data, model);
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      throw new ProviderError(
        `AWS Bedrock request failed: ${(err as Error).message}`,
        0,
        this.name,
        true
      );
    }
  }

  async chatStream(
    model: string,
    messages: ChatMessage[],
    options: ProviderRequestOptions
  ): Promise<ReadableStream<Uint8Array>> {
    const region = this.config.region || "us-east-1";
    const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${model}/converse-stream`;

    const body = this.buildConverseBody(messages, options);
    const bodyStr = JSON.stringify(body);

    const headers = this.signRequest("POST", url, bodyStr, region);

    log.debug({ provider: this.name, model, region }, "Sending AWS Bedrock streaming request");

    try {
      const response = await request(url, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: bodyStr,
        signal: AbortSignal.timeout(options.timeout_ms),
      });

      if (response.statusCode !== 200) {
        const errorBody = await response.body.text();
        const retryable = isRetryableStatus(response.statusCode);
        throw new ProviderError(
          `AWS Bedrock stream returned ${response.statusCode}: ${errorBody.slice(0, 200)}`,
          response.statusCode,
          this.name,
          retryable
        );
      }

      // Convert Bedrock event stream to OpenAI SSE format
      const nodeStream = response.body;
      const encoder = new TextEncoder();
      const completionId = generateCompletionId();
      const created = Math.floor(Date.now() / 1000);

      return new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            let buffer = "";
            for await (const chunk of nodeStream) {
              buffer += chunk instanceof Uint8Array ? new TextDecoder().decode(chunk) : String(chunk);

              // Parse Bedrock event stream and convert to SSE
              const lines = buffer.split("\n");
              buffer = lines.pop() || "";

              for (const line of lines) {
                if (!line.trim()) continue;
                try {
                  const event = JSON.parse(line);
                  if (event.contentBlockDelta?.delta?.text) {
                    const sseData = JSON.stringify({
                      id: completionId,
                      object: "chat.completion.chunk",
                      created,
                      model,
                      choices: [{
                        index: 0,
                        delta: { content: event.contentBlockDelta.delta.text },
                        finish_reason: null,
                      }],
                    });
                    controller.enqueue(encoder.encode(`data: ${sseData}\n\n`));
                  } else if (event.messageStop) {
                    const sseData = JSON.stringify({
                      id: completionId,
                      object: "chat.completion.chunk",
                      created,
                      model,
                      choices: [{
                        index: 0,
                        delta: {},
                        finish_reason: "stop",
                      }],
                    });
                    controller.enqueue(encoder.encode(`data: ${sseData}\n\n`));
                    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                  }
                } catch {
                  // Skip non-JSON lines
                }
              }
            }
            controller.close();
          } catch (err) {
            controller.error(err);
          }
        },
      });
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      throw new ProviderError(
        `AWS Bedrock stream failed: ${(err as Error).message}`,
        0,
        this.name,
        true
      );
    }
  }

  private buildConverseBody(
    messages: ChatMessage[],
    options: ProviderRequestOptions
  ): Record<string, unknown> {
    const converseMessages = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: [{ text: m.content || "" }],
      }));

    const systemMessages = messages.filter((m) => m.role === "system");

    const body: Record<string, unknown> = {
      messages: converseMessages,
    };

    if (systemMessages.length > 0) {
      body.system = systemMessages.map((m) => ({ text: m.content || "" }));
    }

    if (options.max_tokens) {
      body.inferenceConfig = { maxTokens: options.max_tokens };
    }

    return body;
  }

  private normalizeConverseResponse(
    data: Record<string, unknown>,
    model: string
  ): ChatCompletionResponse {
    const output = data.output as Record<string, unknown> | undefined;
    const message = output?.message as Record<string, unknown> | undefined;
    const content = message?.content as Array<{ text?: string }> | undefined;
    const text = content?.[0]?.text || "";

    const usage = data.usage as Record<string, number> | undefined;

    return {
      id: generateCompletionId(),
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: text },
          finish_reason: "stop",
        },
      ],
      usage: usage
        ? {
            prompt_tokens: usage.inputTokens || 0,
            completion_tokens: usage.outputTokens || 0,
            total_tokens: (usage.inputTokens || 0) + (usage.outputTokens || 0),
          }
        : undefined,
    };
  }

  /**
   * AWS Signature V4 signing.
   */
  private signRequest(
    method: string,
    urlStr: string,
    body: string,
    region: string
  ): Record<string, string> {
    const url = new URL(urlStr);
    const service = "bedrock";
    const now = new Date();
    const dateStamp = now.toISOString().replace(/[:-]|\.\d{3}/g, "").slice(0, 8);
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "").slice(0, 15) + "Z";

    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const hashedPayload = createHash("sha256").update(body).digest("hex");

    const canonicalHeaders = `content-type:application/json\nhost:${url.host}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = "content-type;host;x-amz-date";

    const canonicalRequest = [
      method,
      url.pathname,
      "",
      canonicalHeaders,
      signedHeaders,
      hashedPayload,
    ].join("\n");

    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credentialScope,
      createHash("sha256").update(canonicalRequest).digest("hex"),
    ].join("\n");

    const signingKey = this.getSignatureKey(
      this.config.secret_access_key!,
      dateStamp,
      region,
      service
    );

    const signature = createHmac("sha256", signingKey)
      .update(stringToSign)
      .digest("hex");

    const authorization = `AWS4-HMAC-SHA256 Credential=${this.config.access_key_id}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return {
      authorization,
      "x-amz-date": amzDate,
      "x-amz-content-sha256": hashedPayload,
    };
  }

  private getSignatureKey(
    key: string,
    dateStamp: string,
    region: string,
    service: string
  ): Buffer {
    const kDate = createHmac("sha256", `AWS4${key}`).update(dateStamp).digest();
    const kRegion = createHmac("sha256", kDate).update(region).digest();
    const kService = createHmac("sha256", kRegion).update(service).digest();
    const kSigning = createHmac("sha256", kService).update("aws4_request").digest();
    return kSigning;
  }
}
