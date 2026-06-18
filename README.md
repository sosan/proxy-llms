# Multi-Provider AI Proxy

A Cloudflare Worker proxy that routes OpenAI-compatible requests to multiple AI providers (NVIDIA NIM, OpenRouter, local LLMs) with model alias resolution, streaming, retry logic, rate limiting, and metrics collection.

## Quick Start

```bash
pnpm install
pnpm run dev                 # local dev server on :8787
pnpm run test                # run tests
pnpm run typecheck           # type checking
```

## Client Configuration

### OpenCode

Save as `opencode.json` in your project root or `~/.config/opencode/`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "proxy": {
      "name": "Local Proxy",
      "options": {
        "baseURL": "http://localhost:8787/v1"
      },
      "models": {
        "nvidia/moonshotai/kimi-k2.6": {
          "name": "MoonshotAI Kimi-k2.6 (NVIDIA NIM)"
        },
        "nvidia/minimaxai/minimax-m3": {
          "name": "Minimax M3 (NVIDIA NIM)"
        }
      }
    }
  }
}
```

run:

```bash
opencode
```

### Claude Code

```bash
ANTHROPIC_BASE_URL=http://localhost:8787 claude
```

The proxy extracts the **provider** from the first segment of the `model` field in the request body:

- `"nvidia/moonshotai/kimi-k2.6"` → routes to `nvidia` provider
- `"claude/claude-sonnet-4-6"` → routes to `claude` provider (via Anthropic-compatible `/v1/messages`)

### Project Structure

| Directory | Responsibility |
|---|---|
| `src/controllers/` | Business logic — request processing, provider resolution, streaming/buffering decorators, error handling |
| `src/routes/` | Thin declarative route registration — zero business logic |
| `src/providers/` | Provider implementations (NVIDIA, OpenRouter, local) |
| `src/config/providers.ts` | Provider endpoints, model aliases, defaults |
| `src/errors/` | `ProviderError` — preserves upstream HTTP status codes |
| `src/metrics/` | Cloudflare Analytics Engine collection and queries |
| `src/utils/` | Logging (gated by `DEBUG`), rate gate utilities |
| `src/durable-objects/` | Async processing + sliding-window rate limiter |
| `src/transformers/` | Format translators (Claude↔OpenAI) + RTK + Caveman |

## Endpoints

### Chat Completions

```
POST /chat/completions
```

OpenAI-compatible endpoint. The provider and model are resolved from the `model` field (e.g., `nvidia/moonshotai/kimi-k2.6`). Streaming requests pass the upstream SSE body directly; non-streaming requests buffer and return JSON.

### Claude API Compatible

```
POST /v1/messages
```

Accepts Anthropic's Claude API format and transforms it to OpenAI format before forwarding. The response is transformed back to Claude format. Supports per-tier model routing via environment variables:

| Claude tier | Env var | Match (case-insensitive) |
|---|---|---|
| Opus | `ANTHROPIC_OPUS_MODEL` | `opus` in model name |
| Sonnet | `ANTHROPIC_SONNET_MODEL` | `sonnet` in model name |
| Haiku | `ANTHROPIC_HAIKU_MODEL` | `haiku` in model name |
| Fallback | `ANTHROPIC_DEFAULT_MODEL` | Any other model |

Each `ANTHROPIC_*_MODEL` value is a **full routing path** in `provider/organization/model` format — not just a model name. The proxy extracts the provider from the first segment and resolves the rest through normal model resolution.

```
Claude Code sends:
  POST /v1/messages  { model: "claude-sonnet-4-6" }

        ├─ "opus" in model?   → ANTHROPIC_OPUS_MODEL
        ├─ "sonnet" in model?  → ANTHROPIC_SONNET_MODEL = "nvidia/z-ai/glm-5.1"
        ├─ "haiku" in model?   → ANTHROPIC_HAIKU_MODEL
        └─ else                → ANTHROPIC_DEFAULT_MODEL
                         │
                         ▼
        Parses "nvidia/z-ai/glm-5.1"
        → provider: "nvidia"
        → upstream model: "z-ai/glm-5.1"
        → Forwards to NVIDIA NIM
```

If a variable is empty, that tier returns an error — it's disabled.

```toml
# wrangler.toml — examples
ANTHROPIC_OPUS_MODEL = "nvidia/moonshotai/kimi-k2.6"
ANTHROPIC_SONNET_MODEL = "nvidia/z-ai/glm-5.1"
ANTHROPIC_HAIKU_MODEL = "nvidia/z-ai/glm-5.1"
ANTHROPIC_DEFAULT_MODEL = "openrouter/anthropic/claude-sonnet-4"
```

For local development:
```bash
ANTHROPIC_BASE_URL=http://localhost:8787 claude
```

### Model Discovery

| Endpoint | Description |
|---|---|
| `GET /openai/v1/models` | OpenAI-compatible model list |
| `GET /claude/v1/models` | Claude-compatible model list |
| `GET /:provider/models` | Provider-specific model list |

### Async Processing (Durable Objects)

| Endpoint | Description |
|---|---|
| `POST /api/process` | Start async processing |
| `GET /api/status/:processId` | Poll for status |
| `GET /api/stream/:processId` | SSE stream for real-time updates |
| `GET /api/websocket/:processId` | WebSocket for real-time updates |

## Rate Limiting

A sliding-window rate limiter (Durable Object per API key) enforces per-provider limits. Default: **40 requests/minute** with a **1.6 s minimum gap** between requests.

- Window: **60 s sliding window**
- Bucket: **SHA-256 hash of the provider API key** — all calls using the same key share the same limit
- Config: `ProviderConfigs[provider].rateLimit.requestsPerMinute` (see `src/config/providers.ts`)
- When the limit is hit, the proxy returns **429** with `Retry-After`, `RateLimit-Reset`, and `X-RateLimit-*` headers

## Retry Behavior

The NVIDIA provider retries failed requests with **exponential backoff + jitter**. Non-retryable errors propagate immediately.

| Status | Retries? | Base delay | Notes |
|---|---|---|---|
| 400 Bad Request | ✅ | 1000ms | Transient model overload |
| 408 Request Timeout | ✅ | 1000ms | |
| 429 Rate Limited | ❌ | — | Propagated with `Retry-After`, `RateLimit-Reset`, `X-RateLimit-*` headers |
| 502 Bad Gateway | ✅ | 5000ms | |
| 503 Unavailable | ✅ | 5000ms | |
| 504 Gateway Timeout | ✅ | 5000ms | |
| 401/403 | ❌ | — | Client auth errors |
| 422 (malformed response) | ❌ | — | Upstream returned 200 but response unusable |
| Network errors | ✅ | 1000ms | `TypeError`, `fetch failed`, connection lost |

Each retry doubles the base delay with random jitter (±500ms). Maximum attempts: **5** (`RETRY_MAX_ATTEMPTS`). Configure via `NVIDIA_MAX_RETRIES` and `NVIDIA_RETRY_DELAY_MS`.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `NVIDIA_BASE_URL` | — | NVIDIA NIM API base URL |
| `OPENROUTER_BASE_URL` | — | OpenRouter API base URL |
| `ANTHROPIC_OPUS_MODEL` | — | Gateway model for "opus" tier |
| `ANTHROPIC_SONNET_MODEL` | — | Gateway model for "sonnet" tier |
| `ANTHROPIC_HAIKU_MODEL` | — | Gateway model for "haiku" tier |
| `ANTHROPIC_DEFAULT_MODEL` | — | Fallback gateway model |
| `DEBUG` | `false` | Enable debug/info/warn logs |
| `LOG_PAYLOAD` | `false` | Log upstream request payloads (sanitized) |
| `LOG_METRICS` | `false` | Enable Analytics Engine metrics |
| `RTK_ENABLED` | `false` | Enable RTK tool result compression |
| `CAVEMAN_ENABLED` | `false` | Enable terse-style prompts |
| `CAVEMAN_LEVEL` | `full` | Caveman intensity: `lite`, `full`, `ultra` |

## Payload Middlewares

Both `POST /chat/completions` and `POST /v1/messages` apply payload middlewares before sending to the upstream:

### RTK (Request Transformation Kit)

Compresses `tool_result` content in request messages to reduce token usage. Supports:

- OpenAI `messages` with `role: "tool"`
- Claude `tool_result` blocks (string and array forms)
- OpenAI Responses `function_call_output` (string and array forms)
- Kiro `conversationState` format

Auto-detects content type (git diff, grep, ls, etc.) and applies the appropriate filter. Enabled via `RTK_ENABLED=true`.

### Caveman

Injects a terse-style instruction into the system message before sending to the upstream. Works with OpenAI, Claude, and Gemini formats. Configurable via `CAVEMAN_LEVEL` (`lite`, `full`, `ultra`). Enabled via `CAVEMAN_ENABLED=true`.

## Metrics

Collected via Cloudflare Analytics Engine when `LOG_METRICS=true`. Records latency, token counts, finish reason, and error details per request.

## Logging

Uses `utils/logger.ts` — gated by `DEBUG`. Only `logger.error()` is always visible. Never use raw `console.*`.

```typescript
import { logger } from './utils/logger'
logger.info('context', details)   // DEBUG=true only
logger.error('fail', err)          # always visible
```

## Security

Supply-chain hardening via `.npmrc` (ignore lifecycle scripts, block git deps), pnpm trust policy, frozen lockfile validation, and a Dev Container with dropped capabilities. See [SETUP.md](SETUP.md) for deployment details.

## Deployment

```bash
pnpm run deploy:cloudflare          # staging
pnpm run deploy:cloudflare -- production
```

See [SETUP.md](SETUP.md) for Cloudflare secrets, GitHub Actions setup, and troubleshooting.

### CI/CD Deployment

GitHub Actions deploys through `.github/workflows/ci-cd.yaml`.

The workflow:

1. Runs dependency install, lockfile validation, lint, typecheck, and tests.
2. Selects the deployment environment from the workflow input, defaulting to `staging`.
3. Creates `.worker-secrets` from GitHub secrets without printing values.
4. Uses `secrets.CLOUDFLARE_API_TOKEN` and `secrets.CLOUDFLARE_ACCOUNT_ID` to authenticate Wrangler.
5. Runs `wrangler deploy --env <environment> --secrets-file .worker-secrets` through `cloudflare/wrangler-action`.
6. Removes `.worker-secrets` after the deploy step.

Manual workflow dispatch supports:

- `staging`
- `production`

Pushes to `main` deploy to `staging` by default.
