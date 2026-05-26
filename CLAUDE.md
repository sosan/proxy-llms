# Proxy LLMs Claude Code Guide

This repository is a Cloudflare Worker proxy for OpenAI-compatible clients such as Cline. It receives local client requests, resolves friendly model aliases, and forwards requests to NVIDIA NIM.

## Project Shape

- `server.ts`: Hono app entrypoint, middleware setup, error handler, and Durable Object re-export only.
- `controllers/`: Business logic controllers — each controller is a pure function that receives a Hono `Context` and returns a `Response`. Controllers are the single place where request processing, provider resolution, and response construction happen.
  - `controllers/chat.ts`: `handleChatCompletions` — resolves provider, parses body, resolves model aliases, streams or buffers upstream responses, and collects metrics.
  - `controllers/health.ts`: `handleHealth` — simple health-check endpoint.
  - `controllers/legacy.ts`: `handleOpenAIModels`, `handleClaudeModels` — backward-compatible model listing endpoints.
  - `controllers/models.ts`: `handleModels` — returns all models from all providers.
  - `controllers/process.ts`: `handleProcess` — initiates the async Durable Object processing flow.
- `routes/`: Thin route registration. Each file exports individual handler functions that **delegate immediately to controllers**; `routes/index.ts` registers them declaratively. Routes contain zero business logic.
- `durable-objects/processor.ts`: `ProcessorDurableObject` class for the `/api/process` async flow.
- `config/providers.ts`: provider endpoints, model aliases, model defaults, model listing, model resolution, and the single source of truth for `ProviderType`.
- `interfaces/general.ts`: Worker bindings and shared request/response interfaces.
- `errors/provider-error.ts`: provider error type that preserves upstream HTTP status codes.
- `providers/provider-factory.ts`: factory for creating provider instances by name from the URL.
- `providers/base-provider.ts`: shared provider logic for all AI backends.
- `providers/nvidia-provider.ts`: NVIDIA NIM provider.
- `providers/openrouter-provider.ts`: OpenRouter provider.
- `providers/local-provider.ts`: LMStudio, LlamaCPP, and Ollama local providers.
- `metrics/metrics-collector.ts`: request/response metrics collection for Analytics Engine.
- `metrics/queries.ts`: Analytics Engine query helpers.
- `utils/logger.ts`: Conditional logging utility. All debug/info/warn logs are gated by `DEBUG=true`; errors are always emitted. Used everywhere instead of raw `console.*`.
- `__tests__/setup.ts`: Vitest setup file — mocks `crypto.randomUUID` for the Node.js test environment.
- `wrangler.toml`: Cloudflare Worker and Durable Object configuration.


## Architecture

- **Pattern**: Proxy — forward OpenAI-compatible requests to upstream LLM providers
- **Primary responsibility**: Transparent request forwarding with model alias resolution
- **Key concerns**: Model alias resolution, streaming response preservation, error status code forwarding, provider-agnostic interface, rate limiting, metrics collection
- **Runtime**: Cloudflare Workers
- **Primary language**: TypeScript

## Local Commands

- Install dependencies: `pnpm install`
- Run locally: `pnpm run dev`
- Typecheck: `pnpm run typecheck`
- Run tests: `pnpm run test`
- Run tests in watch mode: `pnpm run test:watch`
- Run tests with coverage: `pnpm run test:coverage`
- Deploy: `pnpm run deploy`

Prefer `pnpm run typecheck` after TypeScript changes. Run `pnpm run test` before finishing any non-trivial change. Do not run deploy commands unless the user explicitly asks.

## Runtime Behavior

- **Body-based routing**: The provider is extracted from the first segment of the `model` field in the request body
  - Example: `POST /chat/completions` with body `{ "model": "nvidia/moonshotai/kimi-k2.6", ... }` routes to the `nvidia` provider
  - Example: `POST /chat/completions` with body `{ "model": "claude/claude-3.5-sonnet", ... }` routes to the `claude` provider
  - `provider` is the first segment of the `model` field before the first `/`. It must match a key in `ProviderConfigs` (nvidia, claude, google, openrouter, lmstudio, llamacpp, ollama).
  - The remaining segments are the model name (alias or full upstream ID), which is resolved in `config/providers.ts`.
  - The route handler looks up `ProviderConfigs[provider]` directly — no indirection or hardcoded format-to-config mapping.
- **Claude API model mapping**: The `/messages` endpoint maps Claude model tiers (Opus, Sonnet, Haiku) to gateway models via environment variables:
  - `ANTHROPIC_OPUS_MODEL` — model used when Claude Code sends an model with "opus"
  - `ANTHROPIC_SONNET_MODEL` — model used when Claude Code sends a model with "sonnet"
  - `ANTHROPIC_HAIKU_MODEL` — model used when Claude Code sends a model with "haiku"
  - `ANTHROPIC_DEFAULT_MODEL` — fallback for any other model name
  - Matching is case-insensitive (e.g. `claude-3-opus`, `CLAUDE-3-OPUS`, `claude-opus` all map to Opus)
- **Legacy routes** (backward compatible): `GET /openai/v1/models`, `GET /claude/v1/models` still work for model discovery

- Friendly model IDs such as `glm4.7` or `kimi-k2-thinking` are accepted by the proxy and resolved to upstream IDs such as `z-ai/glm4.7` and `moonshotai/kimi-k2-thinking`.
- The proxy should send the resolved model ID upstream, never the unresolved alias.
- Streaming requests return the upstream SSE body directly to the client.
- Non-streaming requests buffer and return JSON.
- Durable Objects are for the `/api/process` async flow, not for Cline's OpenAI-compatible chat endpoint.
- Metrics are collected via Cloudflare Analytics Engine (`ANALYTICS` binding).


## Routing Pattern (Declarative)

- **`routes/*.ts` export only thin handler functions** — each handler is an `async (c: Context) => Response` function that delegates immediately to the corresponding controller in `controllers/`. No business logic, no conditionals, no validation.
- **`routes/index.ts` is 100% declarative** — it imports all handlers and registers routes with `app.post('/', handler)` or `app.get('/', handler)`. No business logic, no conditionals, no validation.
- **Business logic lives inside `controllers/`** or in modules imported by them (providers, utils).
- **No `register*Routes(app)` functions** — the declarative registration in `routes/index.ts` replaces that indirection.
- **Pattern check**: if `routes/index.ts` contains anything other than route registration (conditionals, validation, business logic), the routing pattern is violated.
- **Pattern check**: if a handler in `routes/*.ts` contains more than a single call to a controller, the separation of concerns is violated.

## Development Rules

- **Controllers contain all business logic** — `controllers/*.ts` are the single source of truth for request processing, provider resolution, streaming/buffering, error handling, and metrics collection.
- **Routes are thin wrappers** — `routes/*.ts` handlers should delegate to controllers immediately. If you find yourself adding logic in a route handler, extract it to the corresponding controller.
- Keep model aliases and defaults in `config/providers.ts`.
- Keep shared interfaces in `interfaces/general.ts`.
- Preserve OpenAI-compatible passthrough fields such as `tools`, `tool_choice`, `response_format`, `stream_options`, `stop`, and `chat_template_kwargs`.
- Do not log API keys, request bodies with secrets, or `.env` values.
- Use the `logger` from `utils/logger.ts` for all logging. It respects the `DEBUG` environment variable so debug noise is controlled centrally. Never use raw `console.log` or `console.error`.
- Do not commit `.env` or `.local`.
- Avoid broad refactors in `server.ts`; extract focused modules when a block becomes mostly configuration or reusable utility logic.
- If changing model resolution, verify both alias and full upstream model ID inputs still work.
- If adding Claude model mapping, add the env var to `Env` in `interfaces/general.ts` and test in `__tests__/providers.test.ts`.
- When adding a new provider:
  1. Add the provider entry to `ProviderConfigs` in `config/providers.ts` (key, models, endpoint, format).
  2. Add `case` in `createProvider()` in `providers/provider-factory.ts`.
  3. Add credentials to `Env` in `interfaces/general.ts`.
  4. `ProviderType` is derived automatically from `ProviderConfigs` keys — no need to edit `interfaces/provider.ts`.
- Body-based routing: `POST /chat/completions` — the provider is extracted from the first segment of the `model` field in the request body (e.g., `"nvidia/moonshotai/kimi-k2.6"` → provider = `nvidia`). The route handler looks up `ProviderConfigs[provider]` directly. No hardcoded format-to-config mapping.

## Development Workflow

1. **Review the request, think about it, and brainstorm**
   - Use `/superpowers:brainstorm` for new features
   - Use `/superpowers:systematic-debugging` for bug fixes
2. **Ask clarifying questions** (when needed)
3. **Think hard and make a plan**
4. **Only when we agree on a plan, create a detailed to-do list** using the `task_progress` parameter
5. **If writing code, add these review tasks at the end of the to-do list:**
   - A. Run `pnpm run typecheck`
   - B. Run `pnpm run test`
   - C. Review against routing pattern: `routes/index.ts` must be declarative
   - D. Run the `security-code-reviewer` sub-agent
6. **Once we agree on the to-do list, start implementation**
7. **During implementation:**
   - Keep things simple and stick to the requested scope
   - Do NOT over-complicate things
   - Do NOT add unnecessary complexity
8. **At the end, verify:**
   - All tests pass (`pnpm run test`)
   - TypeScript compiles cleanly (`pnpm run typecheck`)
   - Routing pattern is respected (declarative `routes/index.ts`)

## Security

- Sensitive files: `.env`, `.local`, `wrangler.toml` — never commit or expose
- Secret handling: Environment variables only, never hardcoded or committed. Use a secrets manager (Infisical, 1Password) and inject at runtime with `infisical run -- pnpm run dev` or `op run -- pnpm run dev`
- Auth scope: Multiple upstream providers (NVIDIA, OpenRouter, LMStudio, etc.)
- **Never store plaintext secrets in `.env` or `.env.dev` files** — use secret references like `infisical://project/env/api-key`

### Supply-chain hardening controls

| Control | File | Description |
|---|---|---|
| Ignore lifecycle scripts | `.npmrc` | `ignore-scripts=true` prevents arbitrary code execution during install |
| Block git deps | `.npmrc` | `allow-git=none` rejects git-source dependencies |
| Install cooldown | `.npmrc` | `min-release-age=30` blocks packages newer than 30 days |
| pnpm trust policy | `pnpm-workspace.yaml` | `trustPolicy: no-downgrade` refuses versions with weaker trust signals |
| Strict dep builds | `pnpm-workspace.yaml` | `strictDepBuilds: true` fails install on unapproved build scripts |
| Block exotic subdeps | `pnpm-workspace.yaml` | `blockExoticSubdeps: true` blocks git/tarball in transitive deps |
| Frozen lockfile check | `package.json` | `corepack pnpm install --lockfile-only --frozen-lockfile --ignore-scripts --optimistic-repeat-install` validates lockfile consistency |
| Dependabot cooldown | `.github/dependabot.yml` | 7-day cooldown before auto-upgrading dependencies |
| CODEOWNERS | `.github/CODEOWNERS` | Mandatory review for lockfiles and package manager config |
| CI hardening | `.github/workflows/ci-cd.yaml` | Deterministic install (`pnpm install --frozen-lockfile --prefer-offline`) + lockfile validation |
| Dev container | `.devcontainer/devcontainer.json` | Isolated environment with `--cap-drop=ALL` and `--no-new-privileges` |

### Pre-install security audit

Before installing new packages, audit them with:

```bash
# npq — pre-install security auditor
pnpm install -g npq
pnpq install <package>

# Socket Firewall — real-time malicious package blocker
pnpm install -g sfw
sfw pnpm install <package>
```

### Secure local development

- Use the provided [Dev Container](.devcontainer/devcontainer.json) for isolated development
- The container drops all capabilities, disables proto pollution, and enforces `ignore-scripts` and `allow-git=none`
- Run `pnpm install --frozen-lockfile --prefer-offline` instead of `pnpm install` for deterministic installs

### CI/CD security

- CI uses `pnpm install --frozen-lockfile --prefer-offline` for deterministic installs
- Lockfile consistency is validated with pnpm before the rest of `validate`
- Dependabot PRs have a 7-day cooldown to avoid compromised fresh releases
- CODEOWNERS requires explicit review for lockfiles and package manager config


## Logging

All code must use the `logger` from `utils/logger.ts` instead of raw `console.*` calls. The logger respects the `DEBUG` environment variable:

```typescript
import { logger } from '../utils/logger'

logger.debug('Detailed debug output', details)        // only when DEBUG=true
logger.info('General info', context)                  // only when DEBUG=true
logger.warn('Warning condition', details)             // only when DEBUG=true
logger.error('Something broke', error)                  // always visible
logger.logUpstreamConfig(requestId, payload)          // sanitized, only when DEBUG=true
```

- `debug()`, `info()`, `warn()` — suppressed when `DEBUG=false` (default in production)
- `error()` — always visible, never suppressed
- `logUpstreamConfig()` — strips `messages` from payload, logs count only; only when `DEBUG=true`

Set `DEBUG=true` in your `.env` or environment to enable debug output.

## Testing

- Tests live in `__tests__/*.test.ts` and run with Vitest.
- The setup file `__tests__/setup.ts` mocks `globalThis.crypto.randomUUID` for Node.js compatibility.
- **Critical import gotcha**: Because `server.js` (legacy) exists alongside `server.ts`, test imports **must** use the `.ts` extension (e.g., `from '../server.ts'`). Without it, Vitest resolves to `server.js` at runtime, which only exports `ProcessorDurableObject` and `default`, causing `TypeError: createResponse is not a function` and similar errors.
- Always run `pnpm run test` after modifying `server.ts`, `config/providers.ts`, or any test file.

## Custom Slash Commands

- `/pattern-review` — Review changes for consistency with local patterns and architectural decisions
- `/security-review` — Review changes for secret handling, unsafe commands, and security risks
