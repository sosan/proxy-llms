# Routing

## Principle

Routes are **thin wrappers**. All business logic lives in controllers. The routing layer should contain zero business logic, zero conditionals, and zero validation.

## Declarative Route Registration

`routes/index.ts` exports a `registerRoutes(app)` function that registers all routes. This is the only place where routes are registered. All business logic is delegated to controllers.

```typescript
import { handleChatCompletions } from '../controllers/chat'
import { handleHealth } from '../controllers/health'
// ...

export const registerRoutes = (app: any) => {
  app.post('/:version/chat/completions', handleChatCompletions)
  app.get('/health', handleHealth)
  // etc.
}
```

## Routes

### OpenAI-Compatible Chat Completions

```
POST /:version/chat/completions → handleChatCompletions (controllers/chat.ts)
```

- The `version` path parameter is typically `v1`.
- The model is resolved from the request body (alias or full upstream model ID).
- The provider is resolved from the request body (`provider` field) or inferred from the model.

### Claude-Compatible Messages

```
POST /:version/messages            → handleClaudeMessages (controllers/claude-messages.ts)
HEAD /:version/messages            → handleProbe ('POST, HEAD, OPTIONS')
OPTIONS /:version/messages         → handleProbe ('POST, HEAD, OPTIONS')
```

- Translates Claude API requests to OpenAI-compatible upstream requests.
- Supports streaming and non-streaming responses.

### Token Counting (Claude-Compatible)

```
POST /:version/messages/count_tokens → handleCountTokens (controllers/count-tokens.ts)
HEAD /:version/messages/count_tokens → handleProbe ('POST, HEAD, OPTIONS')
OPTIONS /:version/messages/count_tokens → handleProbe ('POST, HEAD, OPTIONS')
```

### Model Discovery

```
GET /:version/models              → handleModels (controllers/models.ts)
```

Returns all models from all providers.

### Durable Object Async Processing

```
POST /api/process                  → handleProcess   (controllers/process.ts)
GET  /api/status/:processId        → handleStatus    (controllers/process.ts)
GET  /api/stream/:processId         → handleStream    (controllers/process.ts)
GET  /api/websocket/:processId      → handleWebSocket (controllers/process.ts)
```

### Stop / Root / Health

```
POST /stop                         → handleStop      (controllers/stop.ts)
GET  /                             → handleRoot      (controllers/root.ts)
GET  /health                       → handleHealth    (controllers/health.ts)
HEAD /health                       → handleProbe ('GET, HEAD, OPTIONS')
OPTIONS /health                    → handleProbe ('GET, HEAD, OPTIONS')
HEAD /                             → handleProbe ('GET, HEAD, OPTIONS')
OPTIONS /                          → handleProbe ('GET, HEAD, OPTIONS')
```

## Route Handler Pattern

Each `routes/*.ts` file exports a handler that delegates immediately to a controller:

```typescript
// routes/chat.ts
import { handleChatCompletions } from '../controllers/chat'
export const chatHandler = handleChatCompletions
```

```typescript
// routes/index.ts
import { chatHandler } from './chat'

export const registerRoutes = (app: any) => {
  app.post('/:version/chat/completions', chatHandler)
}
```

## Anti-patterns

- **Do NOT** put business logic in route handlers
- **Do NOT** put validation in route handlers
- **Do NOT** put conditionals in `routes/index.ts`

## Tests

- Route tests verify the correct controller is called
- Integration tests verify end-to-end request/response flow
- Always use `from '../server.ts'` (not `from '../server'`) in test imports
