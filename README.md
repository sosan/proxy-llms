# Multi-Provider AI Proxy

A Cloudflare Worker proxy that routes OpenAI-compatible requests to multiple AI providers (NVIDIA NIM, OpenRouter, local LLMs) with model alias resolution, streaming, retry logic, rate limiting, and metrics collection.

## What You Get

- **Drop-in proxy for Claude Code's Anthropic API calls** — `POST /v1/messages` and `GET /v1/models` (`/claude/v1/models`).
- **Drop-in proxy for OpenAI-compatible chat clients** (Cline, OpenCode, Codex, etc.) — `POST /chat/completions` with body-based provider routing.
- **Per-model routing for Claude Code tiers** — Opus, Sonnet, Haiku, and fallback traffic can each map to a different provider via `ANTHROPIC_OPUS_MODEL`, `ANTHROPIC_SONNET_MODEL`, `ANTHROPIC_HAIKU_MODEL`, `ANTHROPIC_DEFAULT_MODEL`.
- **Provider backends**: NVIDIA NIM, OpenRouter, Google (Gemini), Claude (native), LM Studio, llama.cpp, Ollama.
- **Friendly model aliases** — short IDs like `glm4.7` or `kimi-k2-thinking` resolve to full upstream IDs (`z-ai/glm4.7`, `moonshotai/kimi-k2-thinking`).
- **Streaming + tool use** — SSE passthrough, OpenAI-compatible `tools` / `tool_choice` / `response_format` / `stream_options`.
- **Think-tag handling** — `think-tag-parser` strips reasoning blocks from upstream output.
- **Format translation** — Claude ↔ OpenAI request/response transformers for cross-provider compatibility.
- **Payload middlewares**: RTK (Request Transformation Kit) — `tool_result` compression with content-type autodetection (`git`, `grep`, `ls`, diffs).
- **Caveman terse prompts** — opt-in terse-style system prompt injection (`CAVEMAN_ENABLED`, levels: `lite` / `full` / `ultra`).
- **Sliding-window rate limiter** — Durable Object per API key, default 40 req/min with 1.6s minimum gap; returns 429 with `Retry-After` and `X-RateLimit-*` headers.
- **Exponential backoff + jitter retries** — for NVIDIA 400/408/502/503/504 and network errors; non-retryable codes (401/403/422/429) propagate immediately.
- **Cloudflare Analytics Engine metrics** — per-request latency, token counts, finish reason, error details (gated by `LOG_METRICS`).
- **Async processing flow** — Durable Object–backed `/api/process` for stateful workloads.
- **CI/CD via GitHub Actions** — `.github/workflows/ci-cd.yaml` runs tests on every push/PR and deploys to `staging` on push to `main`, with `production` available via `workflow_dispatch` and health-check after deploy.
- **Codex CLI/VS Code support** — shared `~/.codex/config.toml` provider config wired to the proxy.
- **OpenCode support** — `opencode.json` provider config pointing at the local proxy.

## Local Quick Start

```bash
pnpm install
pnpm run test                # run tests
pnpm run typecheck           # type checking
pnpm run dev                 # local dev server on :8787
```

## Cloud Quick Start

There are two ways to deploy this Worker to Cloudflare:

### Option A: Deploy via CI/CD (GitHub Actions)

Push to GitHub and let `.github/workflows/ci-cd.yaml` handle the deploy:

1. Set the required secrets in your GitHub repo (`Settings → Secrets and variables → Actions`): `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `NVIDIA_API_KEY`, `OPENROUTER_API_KEY`, and (if using metrics) `ANALYTICS_ACCOUNT_ID`, `ANALYTICS_API_TOKEN`.
2. Push to `main` → runs tests and deploys to **staging** automatically.
3. To deploy to **production**, trigger the workflow manually from the Actions tab (`workflow_dispatch`) and select `production` as the environment.

### Option B: Deploy manually from local

`scripts/deploy-cloudflare.sh` (run via `pnpm run deploy:cloudflare`) centralizes secrets in a local `.env` file:

```bash
# .env (gitignored — never commit this file)
CLOUDFLARE_API_TOKEN=...
CLOUDFLARE_ACCOUNT_ID=...
NVIDIA_API_KEY=nvapi-...
OPENROUTER_API_KEY=sk-or-...
```

Then deploy:

```bash
pnpm run deploy:cloudflare               # staging
pnpm run deploy:cloudflare production    # production
```

The script will:
1. Load secrets from `.env` if present (already-exported environment variables take precedence).
2. Validate that `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are set — it exits with an error if either is missing.
3. Run `pnpm run validate` (lockfile check, lint, typecheck, tests) — the deploy is aborted if this fails.
4. Upload `NVIDIA_API_KEY` and `OPENROUTER_API_KEY` to Cloudflare via `wrangler secret put` **if present in `.env`**. If they're not set, the script assumes they were already uploaded in a previous run and continues without error.
5. Run `wrangler deploy --env <environment>`.

Full setup instructions (prerequisites, D1 database setup, troubleshooting) are in [SETUP.md](SETUP.md).

## Choose A Provider

The proxy extracts the **provider** from the first segment of the `model` field in the request body:

- `"nvidia/moonshotai/kimi-k2.6"` → routes to `nvidia` provider
- `"openrouter/nvidia/nemotron-3-ultra-550b-a55b"` → routes to `openrouter` provider

On the client side, model selection and its default parameters are handled through ModelDefaultsById, a map keyed by the full model slug (provider/organization/model) that defines the request format (openai or anthropic), the endpoint, and generation parameters specific to each model (temperature, top_p, max_tokens, tool-calling support, etc.).

### 1. [NVIDIA NIM](https://build.nvidia.com/)

Get a key at [build.nvidia.com/settings/api-keys](https://build.nvidia.com/settings/api-keys).

Paste it into `NVIDIA_API_KEY` secrets.

Currently configured models:

- nvidia/openai/gpt-oss-120b
- nvidia/z-ai/glm4.7
- nvidia/z-ai/glm-5.1
- nvidia/deepseek/deepseek-v4-pro
- nvidia/minimaxai/minimax-m2.7
- nvidia/minimaxai/minimax-m3
- nvidia/moonshotai/kimi-k2-thinking
- nvidia/moonshotai/kimi-k2.6
- nvidia/stepfun-ai/step-3.5-flash
- nvidia/qwen/qwen3-coder-480b-a35b-instruct
- nvidia/google/gemma-4-31b-it

Browse models at [build.nvidia.com](https://build.nvidia.com/explore/discover).

### 2. [OpenRouter](https://openrouter.ai/)

Get a key at [openrouter.ai/keys](https://openrouter.ai/keys).

Paste it into `OPENROUTER_API_KEY`, then set model to an OpenRouter such as:
- openrouter/stealth/owl-alpha
- openrouter/nvidia/nemotron-3-ultra-550b-a55b:free
- openrouter/nvidia/nemotron-3-super-120b-a12b:free
- openrouter/openai/gpt-oss-120b:free
- openrouter/openai/gpt-oss-20b:free
- openrouter/google/gemma-4-31b-it:free
- openrouter/google/gemma-4-26b-a4b-it:free
- openrouter/nvidia/nemotron-3-nano-30b-a3b:free
- openrouter/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free
- openrouter/nvidia/nemotron-nano-9b-v2:free
- openrouter/nvidia/nemotron-nano-12b-v2-vl:free

Browse [all models](https://openrouter.ai/models) or [free models](https://openrouter.ai/collections/free-models).


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

On the server side, environment variables determine which model each Claude tier routes to. For example:

```toml
# wrangler.toml — examples
ANTHROPIC_OPUS_MODEL = "nvidia/moonshotai/kimi-k2.6"
ANTHROPIC_SONNET_MODEL = "minimaxai/minimax-m3"
ANTHROPIC_HAIKU_MODEL = "nvidia/z-ai/glm-5.1"
ANTHROPIC_DEFAULT_MODEL = "nvidia/moonshotai/kimi-k2.6"
```

Each `ANTHROPIC_*_MODEL` value is a **full routing path** in `provider/organization/model` format — not just a model name. The proxy extracts the provider from the first segment and resolves the rest through normal model resolution. If a variable is empty, that tier returns an error — it's disabled.

Once those variables are configured on the server, to point Claude Code at your local proxy:

```bash
ANTHROPIC_BASE_URL=http://localhost:8787 claude
```


### Codex

Save as `.codex/config.toml` in your project root (or `~/.codex/config.toml` for a global setup):

```toml
# Available models through the proxy (swap "model" for any of these):
#   nvidia/openai/gpt-oss-120b
#   nvidia/z-ai/glm4.7
#   nvidia/z-ai/glm-5.1
#   nvidia/deepseek/deepseek-v4-pro
#   nvidia/minimaxai/minimax-m2.7
#   nvidia/minimaxai/minimax-m3
#   nvidia/moonshotai/kimi-k2-thinking
#   nvidia/moonshotai/kimi-k2.6
#   nvidia/stepfun-ai/step-3.5-flash
#   nvidia/qwen/qwen3-coder-480b-a35b-instruct
#   nvidia/google/gemma-4-31b-it
#   openrouter/stealth/owl-alpha
#   openrouter/nvidia/nemotron-3-ultra-550b-a55b:free
#   openrouter/nvidia/nemotron-3-super-120b-a12b:free
#   openrouter/openai/gpt-oss-120b:free
#   openrouter/openai/gpt-oss-20b:free
#   openrouter/google/gemma-4-31b-it:free
#   openrouter/google/gemma-4-26b-a4b-it:free
#   openrouter/nvidia/nemotron-3-nano-30b-a3b:free
#   openrouter/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free
#   openrouter/nvidia/nemotron-nano-9b-v2:free
#   openrouter/nvidia/nemotron-nano-12b-v2-vl:free

model = "nvidia/moonshotai/kimi-k2.6"
model_provider = "proxy"

[model_providers.proxy]
name = "Local Proxy"
base_url = "http://localhost:8787"
env_key = "PROXY_API_KEY"
wire_api = "chat"
```

run:

```bash
codex
```

> **Note:** if you see `The 'nvidia/moonshotai/kimi-k2.6' model is not supported when using Codex with a ChatGPT account.`, Codex is authenticated via OAuth (`codex login`) instead of an API key. A ChatGPT login restricts you to OpenAI's own official models, regardless of `model_provider`. Run `codex logout`, export `PROXY_API_KEY` if your proxy requires one, then run `codex` again so it falls back to the `proxy` provider above.


### Cursor

## Custom provider in Cursor (localhost:8787)

Cursor doesn't support environment variables or config files for this: it's always done through the UI.

**Steps:**
1. `Settings → Models → Add Model`
2. Ex Model name: `nvidia/moonshotai/kimi-k2.6`
3. Enable **Override OpenAI Base URL**
4. Base URL: `http://localhost:8787/v1`
5. API Key: any value (e.g. `local-dev-key`)
6. **Verify**

> ⚠️ The override only applies to chat/plan mode. Composer, Inline Edit, and autocomplete still use Cursor's own backend.


### Project Structure

| Directory | Responsibility |
|---|---|
| `src/server.ts` | Hono app entrypoint, middleware, error handler, Durable Object re-export |
| `src/controllers/` | Business logic — request processing, provider resolution, streaming/buffering, error handling |
| `src/routes/index.ts` | Declarative route registration — imports handlers from controllers, zero business logic |
| `src/providers/` | Provider implementations (`base-provider`, `nvidia-provider`, `openrouter-provider`, `local-provider`) + `provider-factory` |
| `src/config/providers.ts` | Provider endpoints, model aliases, model defaults, model listing, model resolution |
| `src/errors/` | `ProviderError` — preserves upstream HTTP status codes |
| `src/metrics/` | Cloudflare Analytics Engine collection and queries |
| `src/utils/` | Logging (gated by `DEBUG`), response helpers, Claude model mapping, error formatting, NVIDIA rate gate |
| `src/durable-objects/` | `ProcessorDurableObject` (async `/api/process` flow) + `DORateLimiter` (sliding-window per-key) |
| `src/transformers/` | Format translators (Claude ↔ OpenAI, OpenAI stream → Claude) |
| `src/transformers/rtk/` | Request Transformation Kit — payload compression + Caveman prompts + content filters (`git`, `grep`, `ls`, etc.) |
| `src/parsers/` | Heuristic tool-call parser + think-tag parser (model output cleanup) |
| `src/interfaces/` | Worker bindings (`Env`) + shared request/response types, metrics, provider, RTK |
| `src/__tests__/` | Vitest suite mirroring `src/` (controllers, providers, parsers, transformers, durable-objects, integration, utils) |


## Endpoints

### /chat/completions

```
POST /chat/completions
```

OpenAI-compatible endpoint. Forwards the request directly to the configured provider without tier-based routing — the model specified in the request is passed through as-is. The response is returned in the upstream provider's native format (no transformation back to a unified format).

### /v1/models

```
GET /v1/models
```

Returns every model alias the proxy can route to, across all configured providers, in OpenAI-compatible shape. Each entry includes `id`, `object`, `created`, `owned_by`, plus `display_name`, `type`, and `created_at` for Anthropic-format consumers. Used by OpenCode for model discovery (the `models` block in `opencode.json` only overrides display names — discovery still happens here).

Claude Code does not call this endpoint. Model selection for Claude Code comes from `--model`, `ANTHROPIC_*_MODEL` env vars configured server-side, and `settings.json` on the client.

### /messages

```
POST /v1/messages
```

Accepts Anthropic's Claude API format. Applies tier-based routing (Opus/Sonnet/Haiku/Default, based on \`ANTHROPIC_*_MODEL\` environment variables) to select the upstream provider and model, then transforms the request to that provider's format (OpenAI, Anthropic, etc.) before forwarding. The response is transformed back to Claude/Anthropic format before being returned to the client.

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

Deploys run through `.github/workflows/ci-cd.yaml`. The workflow has two jobs:

1. **`test`** — runs on every push, pull request, and dispatch.
   - Installs dependencies (`pnpm install --frozen-lockfile --prefer-offline`)
   - Validates the lockfile (`pnpm run lint:lockfile`)
   - Runs lint (`pnpm run lint`), typecheck (`pnpm run typecheck`), and tests (`pnpm run test`)

2. **`deploy`** — runs after `test` succeeds, only on push to `main`, tags matching `v*`, or `workflow_dispatch`.
   - Reads the `environment` input (`staging` or `production`, default `staging`).
   - Creates `.worker-secrets` from GitHub secrets (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `NVIDIA_API_KEY`, `OPENROUTER_API_KEY`, `ANALYTICS_ACCOUNT_ID`, `ANALYTICS_API_TOKEN`) without printing values.
   - Runs `wrangler deploy --env <environment> --secrets-file .worker-secrets` through `cloudflare/wrangler-action@v4`.
   - Removes `.worker-secrets` after the deploy step (`if: always()`).
   - Hits `<deployment-url>/health` to verify the Worker responds.

Triggers:

| Event | Effect |
|---|---|
| `push` to `main` | runs `test` + deploy to `staging` |
| `push` of tag `v*` | runs `test` + deploy (environment falls back to `staging` unless chosen via dispatch) |
| `pull_request` | runs `test` only (no deploy) |
| `workflow_dispatch` | runs `test` + deploy with the chosen `environment` (`staging` or `production`) |

> For `workflow_dispatch`, the input defaults to `staging`. Choose `production` to deploy to that environment — GitHub Environments can enforce required reviewers for production.

### Automated Releases

Releases are managed separately by `.github/workflows/release.yaml`, which runs `npx semantic-release` on `workflow_dispatch`. It analyzes commit messages, bumps the version, generates the changelog, and publishes a GitHub Release — it does **not** deploy the Worker. Deploys happen through `ci-cd.yaml` (see above).
