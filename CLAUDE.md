# Proxy LLMs Claude Code Guide

This repository is a Cloudflare Worker proxy for OpenAI-compatible clients such as Cline. It receives local client requests, resolves friendly model aliases, and forwards requests to NVIDIA NIM.

## Project Shape

- `server.ts`: Hono app, routes, request transformation, rate limiter, and Durable Object entrypoint.
- `config/providers.ts`: provider endpoints, model aliases, model defaults, model listing, and model resolution.
- `interfaces/general.ts`: Worker bindings and shared request/response interfaces.
- `errors/provider-error.ts`: provider error type that preserves upstream HTTP status codes.
- `providers/provider-factory.ts`: factory for creating provider instances by name from the URL.
- `providers/base-provider.ts`: shared provider logic for all AI backends.
- `providers/nvidia-provider.ts`: NVIDIA NIM provider.
- `providers/openrouter-provider.ts`: OpenRouter provider.
- `providers/local-provider.ts`: LMStudio, LlamaCPP, and Ollama local providers.
- `metrics/metrics-collector.ts`: request/response metrics collection for Analytics Engine.
- `metrics/queries.ts`: Analytics Engine query helpers.
- `__tests__/setup.ts`: Vitest setup file — mocks `crypto.randomUUID` for the Node.js test environment.
- `wrangler.toml`: Cloudflare Worker and Durable Object configuration.


## Architecture

- **Pattern**: Proxy — forward OpenAI-compatible requests to upstream LLM providers
- **Primary responsibility**: Transparent request forwarding with model alias resolution
- **Key concerns**: Model alias resolution, streaming response preservation, error status code forwarding, provider-agnostic interface, rate limiting, metrics collection
- **Runtime**: Cloudflare Workers
- **Primary language**: TypeScript

## Local Commands

- Install dependencies: `npm install`
- Run locally: `npm run dev`
- Typecheck: `npm run typecheck`
- Run tests: `npm run test`
- Run tests in watch mode: `npm run test:watch`
- Run tests with coverage: `npm run test:coverage`
- Deploy: `npm run deploy`

Prefer `npm run typecheck` after TypeScript changes. Run `npm run test` before finishing any non-trivial change. Do not run deploy commands unless the user explicitly asks.

## Runtime Behavior

- **New URL-based routing**: Clients can now route to any provider by URL pattern: `POST /:provider/:format/v1/:company/:model`
  - Example: `POST /nvidia/openai/v1/moonshotai/kimi-k2.6`
  - Example: `POST /openrouter/openai/v1/deepseek/deepseek-v4-pro`
  - Example: `POST /nvidia/anthropic/v1/anthropic/claude-3.5-sonnet`
  - `provider` determines which backend to use (nvidia, openrouter, lmstudio, llamacpp, ollama)
  - `format` determines the API format and endpoint (openai → `/chat/completions`, anthropic → `/messages`, google → `/chat/completions`)
  - `company/model` is combined into the full model ID forwarded upstream
- **Legacy routes** (backward compatible): `GET /openai/v1/models`, `GET /claude/v1/models` still work for model discovery
- Friendly model IDs such as `glm4.7` or `kimi-k2-thinking` are accepted by the proxy and resolved to upstream IDs such as `z-ai/glm4.7` and `moonshotai/kimi-k2-thinking`.
- The proxy should send the resolved model ID upstream, never the unresolved alias.
- Streaming requests return the upstream SSE body directly to the client.
- Non-streaming requests buffer and return JSON.
- Durable Objects are for the `/api/process` async flow, not for Cline's OpenAI-compatible chat endpoint.
- Metrics are collected via Cloudflare Analytics Engine (`ANALYTICS` binding).


## Development Rules

- Keep model aliases and defaults in `config/providers.ts`.
- Keep shared interfaces in `interfaces/general.ts`.
- Preserve OpenAI-compatible passthrough fields such as `tools`, `tool_choice`, `response_format`, `stream_options`, `stop`, and `chat_template_kwargs`.
- Do not log API keys, request bodies with secrets, or `.env` values.
- Do not commit `.env` or `.local`.
- Avoid broad refactors in `server.ts`; extract focused modules when a block becomes mostly configuration or reusable utility logic.
- If changing model resolution, verify both alias and full upstream model ID inputs still work.
- When adding a new provider: add to `ProviderType` in `interfaces/provider.ts`, add case in `createProvider()` in `providers/provider-factory.ts`, and add credentials to `Env` in `interfaces/general.ts`.
- URL-based routing: `/:provider/:format/v1/:company/:model` — provider comes from URL, format maps to a `ProviderConfig` key (openai → `ProviderConfigs.openai`, anthropic → `ProviderConfigs.claude`).

## Security

- Sensitive files: `.env`, `.local`, `wrangler.toml` — never commit or expose
- Secret handling: Environment variables only, never hardcoded or committed
- Auth scope: Multiple upstream providers (NVIDIA, OpenRouter, LMStudio, etc.)


## Testing

- Tests live in `__tests__/*.test.ts` and run with Vitest.
- The setup file `__tests__/setup.ts` mocks `globalThis.crypto.randomUUID` for Node.js compatibility.
- **Critical import gotcha**: Because `server.js` (legacy) exists alongside `server.ts`, test imports **must** use the `.ts` extension (e.g., `from '../server.ts'`). Without it, Vitest resolves to `server.js` at runtime, which only exports `ProcessorDurableObject` and `default`, causing `TypeError: createResponse is not a function` and similar errors.
- Always run `npm run test` after modifying `server.ts`, `config/providers.ts`, or any test file.

## Custom Slash Commands

- `/pattern-review` — Review changes for consistency with local patterns and architectural decisions
- `/security-review` — Review changes for secret handling, unsafe commands, and security risks
