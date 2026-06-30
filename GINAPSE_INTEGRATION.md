# Ginapse Integration — Transparent Memory for Proxy LLMs

Ginapse can transparently enrich every LLM request through proxy-llms with memory context, without any agent-level configuration.

## How It Works

```
Claude Code / Cline / any OpenAI client
        │
        ▼
proxy-llms (your CF Worker)
  │
  ├─ Headers parsed: X-Ginapse-Project, X-Ginapse-Session, X-Ginapse-Session-Start/End
  ├─ Service binding call → Ginapse Worker (internal RPC, no internet)
  │     GET /internal/mem/context
  ├─ Context injected as system message
  └─ Forward to upstream LLM (NVIDIA NIM, OpenAI, etc.)
```

Users only configure proxy-llms. Memory works automatically.

## Session Header Protocol

| Header | When to send | Effect |
|--------|--------------|--------|
| `X-Ginapse-Project` | Always when you want memory | Scopes memory to a project |
| `X-Ginapse-Session` | When continuing a session | Use same ID to keep session alive |
| `X-Ginapse-Session-Start` | Beginning of a new session | Registers session in Ginapse |
| `X-Ginapse-Session-End` | End of a session | Triggers consolidation |
| `X-Ginapse-Session-Keep-Alive` | Periodic ping | Extends 30-minute session timeout |

## Quick Start

### 1. Deploy Ginapse

```bash
pnpm run deploy  # in ginapse-cf directory
```

### 2. Deploy proxy-llms with binding

In `wrangler.toml` (already configured):

```toml
[env.production.bindings]
GINAPSE_BINDING = { service = "ginapse" }
```

```bash
pnpm run deploy  # in proxy-llms directory
```

### 3. Use with any OpenAI-compatible client

```bash
curl -X POST https://your-proxy.workers.dev/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-Ginapse-Project: myapp" \
  -H "X-Ginapse-Session-Start: true" \
  -d '{
    "model": "nvidia/moonshotai/kimi-k2.6",
    "messages": [{"role": "user", "content": "fix the auth bug"}]
  }'
```

First request: creates a new session, fetches prior context, injects it as system message.

Subsequent requests: reuse the same `X-Ginapse-Session` header to continue the session.

Final request: add `X-Ginapse-Session-End: true` to trigger consolidation.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GINAPSE_BINDING` | (required) | Cloudflare service binding to Ginapse Worker |
| `GINAPSE_ENABLED` | `"false"` | Set to `"true"` to activate memory integration |

## Context Injection Format

Memory context is injected as the first system message:

```
[Ginapse Memory — project: myapp, 3 observations]

1. [decision] auth: Decided to use Clerk over Auth0 after security audit
2. [bugfix] ci: GitHub Actions secrets not available in workflow_dispatch
3. [discovery] cache: Cache invalidation happens on session end
```

Token cap: ~2048 tokens. Oldest observations truncated first.

## Deploy Order

Deploy Ginapse first. If proxy-llms deploys before Ginapse, requests continue without memory (fail-open). No errors shown to users.

## Fail-Open Behavior

If Ginapse is unavailable, proxy-llms **silently skips memory enrichment** and forwards the request to the upstream LLM. The user sees no error.
