# Routing Pattern

## Brief overview

Routes must be thin, declarative wrappers. All business logic lives in controllers.

## Rule: Thin Routes, Fat Controllers

- `routes/*.ts` export only thin handler functions — each handler is an `async (c: Context) => Response` function that delegates immediately to the corresponding controller in `controllers/`.
- `routes/index.ts` is 100% declarative — it imports all handlers and registers routes with `app.post('/', handler)` or `app.get('/', handler)` inside `registerRoutes(app)`. No business logic, no conditionals, no validation in the routing layer.
- No business logic, no conditionals, no validation in routes.

## Anti-patterns to avoid

- Do NOT add logic in route handlers — if you find yourself adding logic in a route handler, extract it to the corresponding controller.
- Do NOT put business logic in `routes/index.ts` — route registration should only import handlers and attach them to paths.

## Example

```typescript
// routes/index.ts — 100% declarative
import { handleChatCompletions } from '../controllers/chat'

export const registerRoutes = (app: any) => {
  app.post('/:version/chat/completions', handleChatCompletions)
}

// controllers/chat.ts — all business logic here
export async function handleChatCompletions(c: Context) {
  // ... provider resolution, streaming, error handling, metrics
}
```

## Pattern checks

- If `routes/index.ts` contains anything other than route registration (conditionals, validation, business logic), the routing pattern is violated.
- If a handler in `routes/*.ts` contains more than a single call to a controller, the separation of concerns is violated.
