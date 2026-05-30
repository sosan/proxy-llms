# TypeScript Backend Engineering Rules

## 1. Prefer Strong Typing at Assignment Time

Avoid late casts using `as` whenever possible.

### Bad

```ts
const data = fn()
const record = data as Record<string, unknown>
```

### Good

```ts
const data: Record<string, unknown> = fn()
```

### Better

```ts
type ProviderPayload = {
  model?: string
  stream?: boolean
  [key: string]: unknown
}

const data: ProviderPayload = fn()
```

### Rationale

* Reduces unsafe casts
* Improves readability
* Better type inference
* Reduces temporary variables

---

## 2. Prefer Early Returns Over Nested Conditionals

### Bad

```ts
if (x) {
  if (y) {
    if (z) {
      doSomething()
    }
  }
}
```

### Good

```ts
if (!x) return error()
if (!y) return error()
if (!z) return error()

doSomething()
```

### Rationale

* Reduces cyclomatic complexity
* Keeps the happy path visible
* Easier debugging and maintenance

---

## 3. Keep HTTP Handlers Thin

HTTP handlers should orchestrate logic, not implement all logic inline.

### Bad

Large handlers containing:

* validation
* transformation
* metrics
* streaming
* error handling
* business logic

### Good

```ts
handleStreamingResponse()
handleProviderError()
applyPayloadMiddlewares()
```

### Rationale

* Improves testability
* Improves maintainability
* Easier code reuse

---

## 4. Centralize Error Handling

### Bad

```ts
if (error instanceof ProviderError) ...
if (error instanceof ProviderError) ...
if (error instanceof ProviderError) ...
```

### Good

```ts
const providerError =
  error instanceof ProviderError
    ? error
    : null
```

### Rationale

* Reduces duplication
* Simplifies branching
* Easier future changes

---

## 5. Avoid Generic `Record<string, unknown>` When Structure Exists

### Bad

```ts
Record<string, unknown>
```

for structured payloads.

### Good

```ts
type ProviderPayload = {
  model?: string
  stream?: boolean
  messages?: unknown[]
}
```

### Rationale

* Better autocomplete
* Better developer experience
* Self-documenting code

---

## 6. Keep the Happy Path Readable

The main execution flow should be easy to scan top-to-bottom.

### Preferred Structure

```ts
parse
validate
resolve provider
transform payload
apply middlewares
execute request
return response
```

### Rationale

Handlers are read far more often than written.

---

## 7. Encapsulate Conditional Middleware Logic

### Bad

```ts
if (env.RTK_ENABLED === 'true') { ... }
if (env.CAVEMAN_ENABLED === 'true') { ... }
```

spread across handlers.

### Good

```ts
applyPayloadMiddlewares()
```

### Rationale

* Better encapsulation
* Easier scaling
* Cleaner handlers

---

## 8. Separate Stream and Non-Stream Flows Early

### Bad

Interleaving stream and non-stream logic throughout the handler.

### Good

```ts
return isStream
  ? handleStreamingResponse(...)
  : handleJsonResponse(...)
```

### Rationale

* Reduces mental overhead
* Easier debugging
* Easier maintenance

---

## 9. Reduce Temporary Variables

### Bad

```ts
const a = fn()
const b = a as SomeType
```

### Good

```ts
const b: SomeType = fn()
```

### Rationale

* Less visual noise
* Less state tracking
* Cleaner code

---

## 10. Prefer Focused Helper Functions

### Good

```ts
badRequest()
handleProviderError()
handleStreamingResponse()
applyPayloadMiddlewares()
```

### Rationale

* Improves readability
* Easier testing
* Better reuse
* Smaller diffs in PRs

---

## 11. Avoid Repeated Runtime Type Checks

### Bad

```ts
if (typeof x === 'string') ...
if (typeof x === 'string') ...
```

### Good

Normalize once and reuse.

```ts
const message =
  typeof x === 'string'
    ? x
    : 'unknown'
```

### Rationale

* Cleaner control flow
* Less duplication

---

## 12. Prefer Explicit Function Names

### Bad

```ts
handle()
process()
run()
```

### Good

```ts
handleStreamingResponse()
transformProviderPayload()
recordMetrics()
```

### Rationale

* Improves discoverability
* Easier onboarding
* Easier navigation in large codebases

---

## 13. Keep Side Effects Explicit

Avoid hidden mutations when possible.

### Bad

```ts
modify(payload)
```

### Good

```ts
const updatedPayload = applyMiddleware(payload)
```

Unless mutation is intentionally chosen for performance reasons and clearly documented.

### Rationale

* Easier debugging
* Predictable behavior
* Better composability

---

## 14. Prefer Small Composable Units

### Bad

Large 300+ line handlers or services.

### Good

Small focused helpers with single responsibility.

### Rationale

* Easier testing
* Easier refactoring
* Better long-term maintainability

---

## 15. Optimize for Readability First

Readable code is usually more maintainable than clever abstractions.

### Prefer

* explicit naming
* flat control flow
* predictable structure
* isolated responsibilities

### Avoid

* over-engineering
* deeply nested abstractions
* unnecessary generics
* excessive indirection
