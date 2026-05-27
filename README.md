# LLM Router
<img width="800" height="447" alt="image" src="https://github.com/user-attachments/assets/4365d3ea-7228-4824-b2b5-fcbd097c8549" />

A self-hosted, OpenAI-compatible LLM routing engine with automatic multi-provider failover.

> Keep LLM requests working even when providers fail, rate-limit, or become unavailable.

---

## Why

Modern LLM applications break when providers hit rate limits, go down, or become unstable. LLM Router solves this by providing a single endpoint that automatically switches to the next available provider when one fails. Your application code never changes — just point it at the router.

---

## Features

- **OpenAI-compatible API** — drop-in replacement for any OpenAI SDK client
- **Streaming support** — full SSE streaming with `stream: true`
- **14 providers** — see below
- **Automatic failover** — sequential routing through providers until one succeeds
- **Circuit breaker** — unhealthy providers are temporarily removed from rotation
- **Virtual models** — abstract provider-specific model names behind a single alias
- **Direct provider access** — bypass failover to test individual providers
- **Zero external dependencies** — no database, no Redis, no external services

---

## Supported Providers

| Provider | Free Tier | Get API Key |
|----------|-----------|-------------|
| [Google Gemini](https://ai.google.dev/) | Yes | [AI Studio](https://aistudio.google.com/apikey) |
| [Groq](https://groq.com/) | Yes | [Console](https://console.groq.com/keys) |
| [Cerebras](https://cerebras.ai/) | Yes | [Cloud](https://cloud.cerebras.ai/) |
| [OpenRouter](https://openrouter.ai/) | Yes (limited) | [Keys](https://openrouter.ai/keys) |
| [Cloudflare Workers AI](https://ai.cloudflare.com/) | Yes (generous) | [Dashboard](https://dash.cloudflare.com/) |
| [Mistral AI](https://mistral.ai/) | Limited | [Console](https://console.mistral.ai/api-keys) |
| [Together AI](https://together.ai/) | Trial credits | [Settings](https://api.together.ai/settings/api-keys) |
| [NVIDIA NIM](https://build.nvidia.com/) | Trial credits | [Build](https://build.nvidia.com/) |
| [DeepSeek](https://deepseek.com/) | Pay-per-use | [Platform](https://platform.deepseek.com/api_keys) |
| [xAI (Grok)](https://x.ai/) | Pay-per-use | [Console](https://console.x.ai/) |
| [Cohere](https://cohere.com/) | Trial credits | [Dashboard](https://dashboard.cohere.com/api-keys) |
| [Hugging Face](https://huggingface.co/) | Limited | [Tokens](https://huggingface.co/settings/tokens) |
| [AWS Bedrock](https://aws.amazon.com/bedrock/) | Pay-per-use | [IAM](https://console.aws.amazon.com/iam/) |
| [Ollama](https://ollama.com/) | Free (local) | No key needed |

---

## Quick Start

```bash
git clone https://github.com/your-org/llm-router.git
cd llm-router
pnpm install
```

Edit `config.yaml` — add at least one provider API key, then:

```bash
pnpm run dev
```

Test it:

```bash
curl http://localhost:4000/v1/chat/completions \
  -H "x-api-key: sk_test_123" \
  -H "Content-Type: application/json" \
  -d '{"model": "free-chat", "messages": [{"role": "user", "content": "Hello!"}]}'
```

---

## How It Works

```
Client Request (model: "free-chat")
    │
    ├─→ Provider 1 (Groq)       → 429 Rate Limited → skip
    ├─→ Provider 2 (Cerebras)   → ✅ Success → return response
    ├─→ Provider 3 (NVIDIA)     → (not reached)
    └─→ ...
```

Define virtual models in `config.yaml` that map to an ordered list of providers. The router tries each one top-to-bottom until it gets a successful response.

**Fails over on:** 401, 402, 429, 500, 502, 503, 504, network errors

**Does NOT retry on:** 400 Bad Request (your input is invalid)

### Circuit Breaker

When a provider fails 3 consecutive times, it enters a 10-minute cooldown and is skipped. After cooldown it's automatically re-enabled.

---

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/v1/chat/completions` | Yes | Chat completions (streaming supported) |
| `GET` | `/v1/models` | Yes | List virtual models |
| `GET` | `/v1/providers` | Yes | List available providers + health |
| `POST` | `/v1/providers/:provider/chat/completions` | Yes | Direct provider call |
| `GET` | `/health` | No | Health check |

All `/v1/*` endpoints require `x-api-key` header.

### Response Headers

| Header | Description |
|--------|-------------|
| `x-llm-router-provider` | Which provider handled the request |
| `x-llm-router-model` | Actual model used |
| `x-llm-router-attempts` | Number of providers tried |

---

## Use with OpenAI SDKs

Point any OpenAI-compatible SDK at your router:

**Python:**
```python
from openai import OpenAI

client = OpenAI(base_url="http://localhost:4000/v1", api_key="sk_test_123")
response = client.chat.completions.create(
    model="free-chat",
    messages=[{"role": "user", "content": "Hello!"}],
)
```

**TypeScript:**
```typescript
import OpenAI from "openai";

const client = new OpenAI({ baseURL: "http://localhost:4000/v1", apiKey: "sk_test_123" });
const response = await client.chat.completions.create({
  model: "free-chat",
  messages: [{ role: "user", content: "Hello!" }],
});
```

---

## Configuration

Everything lives in `config.yaml`. Key sections:

```yaml
# Auth
auth:
  api_keys:
    - key: sk_your_key
      name: my-app

# Providers (add your API keys)
providers:
  groq:
    api_key: "gsk_..."
    base_url: "https://api.groq.com/openai/v1"
  cloudflare:
    api_key: "cf_..."
    account_id: "your_account_id"
  aws:
    access_key_id: "AKIA..."
    secret_access_key: "..."
    region: "us-east-1"
  ollama:
    base_url: "http://localhost:11434/v1"

# Virtual models (failover order)
models:
  free-chat:
    - provider: groq
      model: llama-3.3-70b-versatile
    - provider: cerebras
      model: llama3.1-8b
    - provider: nvidia
      model: meta/llama-3.3-70b-instruct

# Tuning
circuit_breaker:
  failure_threshold: 3
  cooldown_seconds: 600
request:
  timeout_ms: 30000
```

Providers without credentials are automatically skipped.

---

## Docker

```bash
docker build -t llm-router .
docker run -p 4000:4000 -v $(pwd)/config.yaml:/app/config.yaml llm-router
```

---

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start with hot reload |
| `pnpm build` | Compile TypeScript |
| `pnpm start` | Run production build |
| `pnpm typecheck` | Type check |
| `pnpm lint` | Lint |

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CONFIG_PATH` | `./config.yaml` | Config file path |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` / `fatal` |
| `NODE_ENV` | — | Set `production` for JSON logs |

---

## Roadmap

- [ ] Weighted routing (latency-aware)
- [ ] Provider scoring system
- [ ] Admin API for runtime config
- [ ] Rate limiting per API key
- [ ] Usage tracking

---

## License

MIT
