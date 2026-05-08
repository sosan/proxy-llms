# Proxy LLMs Claude Code Guide

This repository is a Cloudflare Worker proxy for OpenAI-compatible clients such as Cline. It receives local client requests, resolves friendly model aliases, and forwards requests to NVIDIA NIM.

## Project Shape

- `server.ts`: Hono app, routes, request transformation, NVIDIA provider runtime, and Durable Object entrypoint.
- `config/providers.ts`: provider endpoints, model aliases, model defaults, model listing, and model resolution.
- `interfaces/general.ts`: Worker bindings and shared request/response interfaces.
- `errors/provider-error.ts`: provider error type that preserves upstream HTTP status codes.
- `wrangler.toml`: Cloudflare Worker and Durable Object configuration.

## Local Commands

- Install dependencies: `npm install`
- Run locally: `npm run dev`
- Typecheck: `npm run typecheck`
- Deploy: `npm run deploy`

Prefer `npm run typecheck` after TypeScript changes. Do not run deploy commands unless the user explicitly asks.

## Runtime Behavior

- Cline usually calls `POST /openai/v1/chat/completions`.
- Cline may also call `GET /openai/v1/models` to discover or validate models.
- Friendly model IDs such as `glm4.7` or `kimi-k2-thinking` are accepted by the proxy and resolved to NVIDIA IDs such as `z-ai/glm4.7` and `moonshotai/kimi-k2-thinking`.
- The proxy should send the resolved NVIDIA model ID upstream, never the unresolved alias.
- Streaming requests return NVIDIA's SSE body directly to the client.
- Non-streaming requests buffer and return JSON.
- Durable Objects are for the `/api/process` async flow, not for Cline's OpenAI-compatible chat endpoint.

## Development Rules

- Keep model aliases and defaults in `config/providers.ts`.
- Keep shared interfaces in `interfaces/general.ts`.
- Preserve OpenAI-compatible passthrough fields such as `tools`, `tool_choice`, `response_format`, `stream_options`, `stop`, and `chat_template_kwargs`.
- Do not log API keys, request bodies with secrets, or `.env` values.
- Do not commit `.env` or `.local`.
- Avoid broad refactors in `server.ts`; extract focused modules when a block becomes mostly configuration or reusable utility logic.
- If changing model resolution, verify both alias and full NVIDIA ID inputs still work.

## Preferred Workflow

Read `.claude/shared/workflow.md` before non-trivial changes. For focused edits, inspect the relevant file, patch narrowly, and run `npm run typecheck`.

