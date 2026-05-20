# Multi-Provider AI Proxy with Async Processing

This proxy allows using multiple AI providers compatible with the OpenAI API through NVIDIA NIM, with async processing capabilities using Cloudflare Durable Objects.

## Security

This repository follows [npm Security Best Practices](https://github.com/lirantal/npm-security-best-practices) to harden the supply chain and reduce the attack surface of the dependency tree.

### Implemented hardening controls

| Control | File | Description |
|---|---|---|
| Ignore lifecycle scripts | `.npmrc` | `ignore-scripts=true` prevents arbitrary code execution during install |
| Block git deps | `.npmrc` | `allow-git=none` rejects git-source dependencies |
| Install cooldown | `.npmrc` | `min-release-age=30` blocks packages newer than 30 days |
| pnpm trust policy | `.pnpm-workspace.yaml` | `trustPolicy: no-downgrade` refuses versions with weaker trust signals |
| Strict dep builds | `.pnpm-workspace.yaml` | `strictDepBuilds: true` fails install on unapproved build scripts |
| Block exotic subdeps | `.pnpm-workspace.yaml` | `blockExoticSubdeps: true` blocks git/tarball in transitive deps |
| Lockfile lint | `package.json` | `lockfile-lint` validates integrity, host, HTTPS on every install |
| Dependabot cooldown | `.github/dependabot.yml` | 7-day cooldown before auto-upgrading dependencies |
| CODEOWNERS | `.github/CODEOWNERS` | Mandatory review for lockfiles and package manager config |
| CI hardening | `.github/workflows/ci.yml` | Deterministic install (`npm ci --ignore-scripts`) + lockfile validation |
| Dev container | `.devcontainer/devcontainer.json` | Isolated environment with `--cap-drop=ALL` and `--no-new-privileges` |

### Pre-install audit tools (recommended)

Install [npq](https://github.com/lirantal/npq) to audit packages before installation:

```bash
npm install -g npq
npq install <package>
```

Or use [Socket Firewall](https://socket.dev/blog/introducing-socket-firewall) (`sfw`) to block malicious packages in real time:

```bash
npm install -g sfw
sfw npm install <package>
```

### No plaintext secrets

Do not store plaintext secrets in `.env` or `.env.dev` files. Use a secrets manager (Infisical, 1Password, etc.) and inject secrets at runtime with Infisical CLI, example:

```bash
# Basic usage
infisical run -- npm run dev

# Watch for secret changes (development only)
infisical run --watch -- npm run dev
```

> **Tip:** Use `infisical login` to authenticate once, then `infisical run` injects secrets without plaintext files.

**Alternatives:** If you use 1Password, you can do the same with `op run -- npm start`.

### Local development

Open the project in the provided [Dev Container](.devcontainer/devcontainer.json) to keep dependency execution isolated from your host system.

## Endpoints

### Synchronous AI Providers
- `POST /chat/completions` - Compatible with OpenAI API (provider extracted from the `model` field in the request body, e.g. `"model": "nvidia/moonshotai/kimi-k2.6"`)
- `POST /v1/messages` - Compatible with Anthropic Claude API (automatically transforms request/response between Claude and OpenAI formats)

> **Note:** The provider is extracted from the first segment of the `model` field in the request body. For example, `"model": "nvidia/moonshotai/kimi-k2.6"` routes to the `nvidia` provider, and `"model": "claude/claude-3.5-sonnet"` routes to the `claude` provider.

#### Claude API Compatibility (`/v1/messages`)

The proxy supports the Anthropic Claude API format on the `/v1/messages` endpoint. When a client sends a request in Claude format, the proxy:

1. **Maps the model** to a gateway model based on environment variables (case-insensitive):
   - Model name contains "opus" → `ANTHROPIC_OPUS_MODEL`
   - Model name contains "sonnet" → `ANTHROPIC_SONNET_MODEL`
   - Model name contains "haiku" → `ANTHROPIC_HAIKU_MODEL`
   - Any other model name → `ANTHROPIC_DEFAULT_MODEL`
   - If the env var is not set, the original model name is used

2. **Transforms the request** from Claude format to OpenAI format:
   - Claude `messages` with `role: system/user/assistant/tool` → OpenAI format
   - Claude `system` field → OpenAI system message
   - Claude `tools` → OpenAI `tools`
   - Claude `tool_choice` → OpenAI `tool_choice`
   - Supports image blocks (`type: image`, base64 source) → OpenAI `image_url`
   - Supports tool use/result blocks → OpenAI `tool_calls` / `tool` messages

3. **Routes to the provider** based on the model field (e.g., `nvidia/moonshotai/kimi-k2.6`)

4. **Transforms the response** from OpenAI format back to Claude format:
   - OpenAI `choices[].message.content` → Claude `content` text blocks
   - OpenAI `choices[].message.tool_calls` → Claude `tool_use` blocks
   - OpenAI `finish_reason` → Claude `stop_reason`

This allows clients that expect a Claude-compatible API (e.g. Claude Code) to use any OpenAI-compatible provider transparently, with per-tier model routing.

### Claude Code Configuration

To route Claude Code tiers to specific gateway models, set these environment variables in `wrangler.toml` or `.env`:

```toml
ANTHROPIC_OPUS_MODEL = "nvidia/..."
ANTHROPIC_SONNET_MODEL = "openrouter/..."
ANTHROPIC_HAIKU_MODEL = "lmstudio/..."
ANTHROPIC_DEFAULT_MODEL = "nvidia/..."
```

Example: When Claude Code sends `claude-4.7-opus`, the proxy routes to `nvidia/moonshotai/kimi-k2.6` (if set).

### Legacy routes (backward compatible)
- `GET /openai/v1/models` - OpenAI-compatible model discovery
- `GET /claude/v1/models` - Claude-compatible model discovery
- `GET /:provider/models` - Provider-specific model listing

### Async Processing
- `POST /api/process` - Start async processing
- `GET /api/status/:processId` - Get status (polling)
- `GET /api/stream/:processId` - SSE stream for real-time updates
- `GET /api/websocket/:processId` - WebSocket for real-time updates

## Usage with Cline/Claude Code

### Async Processing

1. **Start process:**

## Metrics

The proxy collects per-request metrics using Cloudflare Analytics Engine. Metrics are only recorded when `LOG_METRICS=true` is set.

### Enabling metrics

Set `LOG_METRICS = "true"` in `wrangler.toml` or via environment variable. When disabled (default), no metrics are collected or written.

### Collected metrics

| Metric | Type | Description |
|--------|------|-------------|
| `requestId` | string | Unique request identifier |
| `model` | string | Resolved model ID |
| `provider` | string | Provider name (nvidia, openrouter, etc.) |
| `isStream` | boolean | Whether the request was streaming |
| `upstreamLatencyMs` | number | Time to first byte from upstream |
| `totalProxyMs` | number | Total time spent in the proxy |
| `ttftMs` | number | Time to first token (streaming only) |
| `generationTimeMs` | number | Generation time in ms (streaming only) |
| `tokensPerSecond` | number | Estimated tokens per second |
| `promptTokens` | number | Prompt tokens (non-streaming only) |
| `completionTokens` | number | Completion tokens (non-streaming only) |
| `totalTokens` | number | Total tokens (non-streaming only) |
| `finishReason` | string | Finish reason from upstream |
| `upstreamStatus` | number | HTTP status from upstream |
| `errorType` | string | Error type if the request failed |
| `errorMessage` | string | Error message if the request failed |

Metrics are written as data points to the Cloudflare Analytics Engine dataset bound as `ANALYTICS` in `wrangler.toml`.

## Logging

The project uses a centralized `logger` from `utils/logger.ts` that respects the `DEBUG` environment variable. When `DEBUG=true`, debug/info/warn logs are emitted; when `DEBUG=false` (default in production), only `error` logs are visible.

```typescript
import { logger } from './utils/logger'

logger.info('General info', context)          // only when DEBUG=true
logger.warn('Warning condition', details)     // only when DEBUG=true
logger.error('Something broke', error)        // always visible
logger.logUpstreamConfig(id, payload)         // sanitized, only when LOG_PAYLOAD=true
```

- Set `DEBUG=true` in `.env` to enable debug output during development.
- Never use raw `console.log` / `console.error` directly.
