# Architecture

## Overview

Proxy LLMs is a Cloudflare Worker that acts as a transparent proxy between OpenAI-compatible clients (Cline, Claude Code, etc.) and upstream LLM providers (NVIDIA NIM, OpenRouter, LMStudio, Ollama, LlamaCPP). It resolves friendly model aliases to full upstream model IDs, handles streaming and non-streaming responses, collects metrics, and provides async processing capabilities via Durable Objects.

## High-Level Flow

```
Client Request → Hono App → Route Handler → Controller → Provider → Upstream LLM
                                          ↓
                                    MetricsCollector → Analytics Engine
```

## Key Components

### Entrypoint (`server.ts`)
- Hono app setup
- Global error handler
- Route registration (delegates to `routes/index.ts`)
- Durable Object re-export (`ProcessorDurableObject`)

### Controllers (`controllers/`)
Business logic lives here. Each controller is a pure function receiving a Hono `Context` and returning a `Response`:

- **`chat.ts`**: `handleChatCompletions` — resolves provider, parses body, resolves model aliases, streams or buffers upstream responses, collects metrics.
- **`claude-messages.ts`**: `handleClaudeMessages` — translates Claude API requests to OpenAI-compatible upstream requests and streams responses back in Claude format.
- **`count-tokens.ts`**: `handleCountTokens` — Claude-compatible token counting endpoint.
- **`health.ts`**: `handleHealth` — simple health-check endpoint.
- **`legacy.ts`**: `handleOpenAIModels`, `handleClaudeModels` — backward-compatible model listing.
- **`models.ts`**: `handleModels` — returns all models from all providers; `handleProviderModels` — returns models for a single provider.
- **`process.ts`**: `handleProcess`, `handleStatus`, `handleStream`, `handleWebSocket` — initiates async Durable Object flow.
- **`root.ts`**: `handleRoot` — root endpoint.
- **`stop.ts`**: `handleStop` — stop all pending tasks / CLI sessions.
- **`probe.ts`**: `handleProbe` — probe handler for HEAD/OPTIONS requests.

### Routes (`routes/`)
Thin route registration with zero business logic:
- `routes/*.ts` export handler functions that delegate immediately to controllers.
- `routes/index.ts` exports `registerRoutes(app)` that registers all routes.

### Providers (`providers/`)
- **`provider-factory.ts`**: Creates provider instances by name from the URL.
- **`base-provider.ts`**: Shared logic for all AI backends (streaming, error handling, logging).
- **`nvidia-provider.ts`**: NVIDIA NIM provider.
- **`openrouter-provider.ts`**: OpenRouter provider.
- **`local-provider.ts`**: LMStudio, LlamaCPP, and Ollama local providers.

### Configuration (`config/providers.ts`)
- `ProviderConfigs`: provider endpoints, model aliases, defaults
- `resolveModel()`: alias → full upstream ID resolution
- `resolveAnthropicModel()`: Claude model tier → upstream model mapping
- `resolveModelFormat()`: resolves output format per provider/model
- `ModelDefaultsById`: per-model default parameters
- `PROVIDER_DEFAULT_FORMATS`: default API format per provider
- `ProviderType`: derived automatically from `ProviderConfigs` keys

### Metrics (`metrics/`)
- **`metrics-collector.ts`**: Collects request/response metrics, writes to Cloudflare Analytics Engine.
- **`queries.ts`**: Analytics Engine SQL query helpers for aggregated metrics.

### Transformers (`transformers/`)
- **`claude-to-openai.ts`**: Converts Claude API requests to OpenAI format.
- **`openai-to-claude.ts`**: Converts OpenAI responses to Claude format.
- **`openai-stream-to-claude.ts`**: Transforms OpenAI SSE streams to Claude SSE streams.
- **`rtk/`**: RTK filter pipeline (applyFilter, autodetect, caveman, registry, filters)

### Parsers (`parsers/`)
- **`heuristic-tool-parser.ts`**: Parses tool calls from model responses heuristically.
- **`think-tag-parser.ts`**: Parses `<think>` tags from model responses.
- **`index.ts`**: Parser exports.

### Durable Objects (`durable-objects/`)
- **`processor.ts`**: `ProcessorDurableObject` — async workflow processing with polling/SSE/WebSocket updates.

### Logging (`utils/logger.ts`)
- Centralized logger gated by `DEBUG` environment variable.
- `debug()`, `info()`, `warn()` suppressed when `DEBUG=false`.
- `error()` always visible.
- `logUpstreamConfig()` sanitizes payloads (strips `messages`) before logging.

## Runtime

- **Platform**: Cloudflare Workers
- **Streaming**: SSE (Server-Sent Events) forwarded transparently
- **Non-streaming**: JSON buffered and returned
- **Async**: Durable Objects for `/api/process` with polling/SSE/WebSocket updates
- **Metrics**: Cloudflare Analytics Engine (`ANALYTICS` binding)

## Data Flow

1. Client sends OpenAI-compatible request (with model alias like `"glm4.7"`) or Claude-compatible request
2. Route handler delegates to the appropriate controller (`handleChatCompletions` or `handleClaudeMessages`)
3. Controller resolves provider from request body or model
4. `resolveModel()` converts alias to full upstream ID (e.g., `"z-ai/glm4.7"`)
5. Request forwarded to upstream with resolved model ID
6. Response streamed (SSE) or buffered (JSON) back to client
7. Metrics collected and written to Analytics Engine

## Constraints

- Cloudflare Workers runtime (no Node.js-specific APIs)
- Must preserve OpenAI API compatibility
- Must preserve Claude API compatibility (for `/v1/messages`)
- Model aliases must never break backward compatibility
- Streaming is the preferred path for agent clients
- Durable Objects only for stateful async workflows, not for chat proxying
