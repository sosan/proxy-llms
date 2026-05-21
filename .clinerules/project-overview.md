# Project Overview

## Brief overview

This is a Cloudflare Worker proxy for OpenAI-compatible AI clients (Cline, Claude Code, etc.). It receives local client requests, resolves friendly model aliases, and forwards requests to upstream LLM providers (NVIDIA NIM, OpenRouter, LMStudio, LlamaCPP, Ollama).

## Tech Stack

- **Runtime**: Cloudflare Workers with Durable Objects for async flows
- **Framework**: Hono (lightweight web framework)
- **Language**: TypeScript
- **Testing**: Vitest with Node.js compatibility mocks
- **Package Manager**: pnpm with strict supply-chain hardening
- **Primary Pattern**: Proxy — forward OpenAI-compatible requests to upstream LLM providers

## Key Concerns

- Model alias resolution (friendly names → upstream IDs)
- Streaming SSE response preservation
- Error status code forwarding from upstream
- Provider-agnostic interface
- Rate limiting
- Metrics collection via Cloudflare Analytics Engine

## Project Structure

- `server.ts` — Hono app entrypoint, middleware, error handler, Durable Object re-export
- `controllers/` — Business logic controllers (all request processing happens here)
- `routes/` — Thin route registration (delegates immediately to controllers)
- `providers/` — Provider implementations (NVIDIA, OpenRouter, local)
- `config/providers.ts` — Provider configs, model aliases, model resolution
- `interfaces/` — Shared TypeScript interfaces
- `metrics/` — Metrics collection and Analytics Engine queries
- `utils/` — Logger, response helpers
- `durable-objects/` — Async processing with Durable Objects
