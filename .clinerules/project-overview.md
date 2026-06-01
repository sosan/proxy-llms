# Project Overview

## Brief overview

This is a Cloudflare Worker proxy for OpenAI-compatible and Claude-compatible AI clients (Cline, Claude Code, etc.). It receives local client requests, resolves friendly model aliases, and forwards requests to upstream LLM providers (NVIDIA NIM, OpenRouter, LMStudio, LlamaCPP, Ollama, Google, Claude/Anthropic).

## Tech Stack

- **Runtime**: Cloudflare Workers with Durable Objects for async flows
- **Framework**: Hono (lightweight web framework)
- **Language**: TypeScript
- **Testing**: Vitest with Node.js compatibility mocks
- **Package Manager**: pnpm with strict supply-chain hardening
- **Primary Pattern**: Proxy — forward OpenAI-compatible and Claude-compatible requests to upstream LLM providers

## Key Concerns

- Model alias resolution (friendly names → upstream IDs)
- Streaming SSE response preservation
- Error status code forwarding from upstream
- Provider-agnostic interface
- Rate limiting
- Metrics collection via Cloudflare Analytics Engine
- **Claude API compatibility** — translates Claude `/v1/messages` to OpenAI upstream and back

## Project Structure

- `server.ts` — Hono app entrypoint, middleware, error handler, Durable Object re-export
- `controllers/` — Business logic controllers (all request processing happens here)
  - `chat.ts` — OpenAI-compatible chat completions
  - `claude-messages.ts` — Claude-compatible `/v1/messages` endpoint
  - `count-tokens.ts` — Claude-compatible token counting
  - `health.ts` — Health check endpoint
  - `legacy.ts` — Backward-compatible model listing
  - `models.ts` — Model discovery endpoints
  - `process.ts` — Async Durable Object workflow
  - `root.ts` — Root endpoint
  - `stop.ts` — Stop all pending tasks
  - `probe.ts` — HEAD/OPTIONS probe handler
- `routes/` — Thin route registration (delegates immediately to controllers)
- `providers/` — Provider implementations (NVIDIA, OpenRouter, local, Claude, Google)
- `config/providers.ts` — Provider configs, model aliases, model resolution, Claude tier mapping
- `interfaces/` — Shared TypeScript interfaces
- `metrics/` — Metrics collection and Analytics Engine queries
- `utils/` — Logger, response helpers, Claude model mapping, Claude request utilities
- `errors/` — Provider error classes
- `parsers/` — Tool call and think tag parsers
- `transformers/` — Claude ↔ OpenAI format transformers, RTK filter pipeline
- `durable-objects/` — Async processing with Durable Objects
