# Routing

## Principle

Routes are **thin wrappers**. All business logic lives in controllers. The routing layer should contain zero business logic, zero conditionals, and zero validation.

## Declarative Route Registration

`routes/index.ts` is 100% declarative. It imports handlers and registers them:

```typescript
import { handleChatCompletions } from '../controllers/chat'
import { handleHealth } from '../controllers/health'
// ...

app.post('/:provider/chat/completions', handleChatCompletions)
app.get('/health', handleHealth)
// etc.
```

No `register*Routes(app)` functions. No route guards in the routing layer.

## URL-Based Routing

The proxy routes chat completion requests by provider name in the URL:

```
POST /:provider/chat/completions
```

### Path Parameters

| Param | Description | Example |
|-------|-------------|---------|
| `provider` | Provider backend key in `ProviderConfigs` | `nvidia`, `openrouter`, `lmstudio`, `llamacpp`, `ollama` |

### Validation

- The route handler looks up `ProviderConfigs[urlProvider]` directly.
- The model is resolved from the request body (alias or full upstream model ID).
- If the provider is not found, returns 400 with a list of supported providers.

### Examples

```
POST /nvidia/chat/completions
POST /openrouter/chat/completions
POST /lmstudio/chat/completions
```

### Request Body

The model is specified in the request body, either as an alias or full upstream model ID:

```json
{
  "model": "glm4.7",
  "messages": [...],
  "stream": true
}
```

Or with a full upstream model ID:

```json
{
  "model": "z-ai/glm4.7",
  "messages": [...],
  "stream": true
}
```

## Model Discovery Routes

```
GET /:version/models        → handleModels         (all providers)
GET /:provider/models       → handleProviderModels (single provider)
```

## Legacy Routes (Backward Compatible)

```
GET /openai/v1/models       → handleOpenAIModels
GET /claude/v1/models       → handleClaudeModels
```

These remain for model discovery by older clients.

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
app.post('/:provider/chat/completions', chatHandler)
```

## Anti-patterns

- **Do NOT** put business logic in route handlers
- **Do NOT** put validation in route handlers
- **Do NOT** put conditionals in `routes/index.ts`
- **Do NOT** use `register*Routes(app)` indirection

## Tests

- Route tests verify the correct controller is called
- Integration tests verify end-to-end request/response flow
- Always use `from '../server.ts'` (not `from '../server'`) in test imports
