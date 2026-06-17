# Setup Guide

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/) 8+
- [Cloudflare account](https://dash.cloudflare.com/) - for production deploys
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (`pnpm add -g wrangler`)

## Installation

```bash
pnpm install
```

Runs `pnpm install --frozen-lockfile --ignore-scripts` to match CI behavior.

## Environment Variables

Variable management strategy:

| Variable | Secret? | Source |
|---|---|---|
| `NVIDIA_API_KEY` | ✅ Yes | NVIDIA NIM Account |
| `OPENROUTER_API_KEY` | ✅ Yes | OpenRouter Account |
| `ANALYTICS_TOKEN` | ✅ Yes | Cloudflare Dashboard → Analytics & Logs |
| `OPENCODE_API_KEY` | ✅ Yes | Opencode API Account |
| `OPENROUTER_BASE_URL` | ❌ No | OpenRouter API base URL |
| `NVIDIA_BASE_URL` | ❌ No | NVIDIA NIM API base URL |
| `ANTHROPIC_*_MODEL` | ❌ No | Claude tier model mappings |
| `DEBUG` | ❌ No | Enable debug logging |
| `LOG_PAYLOAD` | ❌ No | Log request payloads |
| `LOG_METRICS` | ❌ No | Enable Analytics Engine |
| `RTK_ENABLED` | ❌ No | RTK compression |
| `CAVEMAN_ENABLED` | ❌ No | Terse prompts |
| `CAVEMAN_LEVEL` | ❌ No | Caveman intensity: `lite`, `full`, `ultra` |

## Setup

```bash
cp wrangler.example.toml wrangler.toml
```

### Local Development

Create a `.dev.vars` file (gitignored):

```
NVIDIA_API_KEY=nvapi-...
OPENROUTER_API_KEY=sk-or-...
```

Secrets are injected at runtime via `infisical run` or `op run`:

```bash
op run -- pnpm run dev
# or
infisical run -- pnpm run dev
```

### Cloudflare D1 Database (Production)

```bash
wrangler d1 create proxy-llms-db   # creates a new database
# then update wrangler.toml with the returned database_id
```

Create tables:

```bash
wrangler d1 execute proxy-llms-db --file=./db/init.sql
```

Set up D1 locally:

```bash
wrangler d1 execute proxy-llms-db --local --file=./db/init.sql
```

### Run Locally

```bash
pnpm run dev      # wrangler dev on :8787
```

### Test

```bash
pnpm run test                   # full suite
pnpm run test:watch             # watch mode
pnpm run test:coverage          # with coverage
```

## Deployment

### Cloudflare Workers

Add secrets:

```bash
echo "nvapi-..." | wrangler secret put NVIDIA_API_KEY
echo "sk-or-..." | wrangler secret put OPENROUTER_API_KEY
```

Set non-secret vars:

```bash
wrangler secret put ANALYTICS_TOKEN      # if applicable
```

Then deploy:

```bash
pnpm run deploy:cloudflare               # staging
pnpm run deploy:cloudflare -- production # production
```

### Durable Objects

The project uses two Durable Object classes:

| Class | Binding | Purpose |
|---|---|---|
| `ProcessorDurableObject` | `PROCESSOR` | Async task processing (status polling, SSE, WebSocket) |
| `RateLimiterDurableObject` | `DO_RATE_LIMITER` | Sliding-window rate limiter (40 req/min default) |

Rate limiter DO behavior:
- Bucket: SHA-256 hash of the provider API key
- Window: 60 s sliding window
- Default limit: 40 requests/minute (per `ProviderConfigs[provider].rateLimit.requestsPerMinute`)
- Minimum gap: `minRetryDelayMs` (default 1,600 ms for NVIDIA)
- On rejection: returns 429 with `Retry-After`, `RateLimit-Reset`, `X-RateLimit-*` headers

### Monitoring

Access the Cloudflare Dashboard → Workers & Pages → proxy-llms-prod:

- **Metrics → Logs**: Real-time request logs, filtered by environment
- **Metrics → Analytics**: GraphQL-based analytics, cached and filterable
- **Metrics → Workers Metrics**: Invocations, errors, CPU time, duration

### CI/CD Pipelines

The project uses GitHub Actions for CI/CD:

| Workflow | File | Trigger |
|---|---|---|
| Validate | `.github/workflows/validate.yaml` | PRs to `main`, `dev/*` (push and pull_request) |
| CD | `.github/workflows/ci-cd.yaml` | Merges to `main` (deploy production), `dev/*` (deploy staging) |

Manual deploy:

```bash
pnpm run deploy:cloudflare               # staging
pnpm run deploy:cloudflare production    # production
```

## Payload Middlewares Configuration

### RTK (Request Transformation Kit)

Compresses `tool_result` content in request messages to reduce token usage. Supports OpenAI, Claude, OpenAI Responses, and Kiro formats. Auto-detects content type (git diff, grep, ls, etc.) and applies the appropriate filter.

Enable via environment:

```bash
RTK_ENABLED=true
```

### Caveman

Injects a terse-style instruction into the system message before sending to the upstream. Works with OpenAI, Claude, and Gemini formats.

Enable via environment:

```bash
CAVEMAN_ENABLED=true
CAVEMAN_LEVEL=full        # Options: lite, full, ultra
```

## Troubleshooting

### "Non-retryable error" or "Failed to fetch model"

Check:

1. Is the API key/secret set correctly?
   ```bash
   wrangler secret list
   ```
2. Is `NVIDIA_BASE_URL` or `OPENROUTER_BASE_URL` overridden correctly? For Cloudflare Workers, set `OPENROUTER_BASE_URL` as a wrangler secret or env var.
3. Are you using a model alias that exists?
   ```bash
   curl https://your-worker.workers.dev/nvidia/models
   ```

### Tests fail with `TypeError: createResponse is not a function`

This happens when Vitest resolves to `server.js` (the compiled ESM wrapper) instead of `server.ts`. Fix by ensuring test imports use `.ts` extension:

```typescript
// ✅ correct
import { handleChatCompletions } from '../controllers/chat.ts'

// ❌ wrong (resolves to .js)
import { handleChatCompletions } from '../controllers/chat'
```

### `pnpm install` fails

Check `.npmrc` restrictions:

```bash
cat .npmrc
```

If `ignore-scripts=true` or `allow-git=none` block install, temporarily remove those lines for trusted packages.

### "Invalid binding name" when deploying

Redeploy after adding a D1 binding, or check that `database_name` exists.
