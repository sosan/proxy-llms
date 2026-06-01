# Routing Pattern (Declarative)

## Core Rule

All HTTP route handlers in this project follow a strict declarative routing pattern.

## File Structure

```
routes/
  chat.ts    → export handleChatCompletions
  models.ts  → export handleModels, handleProviderModels
  legacy.ts  → export handleOpenAIModels, handleClaudeModels
  process.ts → export handleProcess, handleStatus, handleStream, handleWebSocket
  health.ts  → export handleHealth
  index.ts   → importa todo y registra puramente via registerRoutes(app)
```

## Rules

1. **`routes/*.ts` export only handler functions** — each handler is an `async (c: Context) => Response` function without any side-effect registration logic.
2. **`routes/index.ts` is 100% declarative** — it imports all handlers and registers routes with `app.post('/', handler)` or `app.get('/', handler)` inside `registerRoutes(app)`. No business logic, no conditionals, no validation.
3. **Business logic lives inside handlers** or in modules imported by them (services, providers, utils).
4. **Pattern check**: if `routes/index.ts` contains anything other than route registration (conditionals, validation, business logic), the routing pattern is violated.

## Anti-Patterns (Do NOT)

- Do NOT put validation logic in `routes/index.ts`
- Do NOT put business logic in `routes/index.ts`
- Do NOT import and call side-effect functions from route files

## Examples

### Correct: routes/index.ts

```ts
import { handleChatCompletions } from '../controllers/chat'
import { handleModels, handleProviderModels } from '../controllers/models'

export const registerRoutes = (app: any) => {
  app.post('/:version/chat/completions', handleChatCompletions)
  app.get('/:version/models', handleModels)
  app.get('/:provider/models', handleProviderModels)
}
```

### Incorrect: routes/index.ts

```ts
// BAD: business logic in route registration
app.post('/:version/chat/completions', async (c) => {
  const provider = c.req.param('provider')
  if (!provider) return c.json({ error: 'missing' }, 400)
  // ... more logic ...
})
```
