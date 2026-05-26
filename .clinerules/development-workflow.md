# Development Workflow

## Brief overview

Standard development commands and workflow for the proxy-llms project.

## Local commands

- Install dependencies: `pnpm install`
- Run locally: `pnpm run dev`
- Typecheck: `pnpm run typecheck`
- Run tests: `pnpm run test`
- Run tests in watch mode: `pnpm run test:watch`
- Run tests with coverage: `pnpm run test:coverage`
- Deploy: `pnpm run deploy`

## Validation script

The `validate` script runs all checks in sequence:
1. `lockfile-lint`
2. `oxlint`
3. `tsc --noEmit`
4. `vitest run`

```bash
pnpm run validate
```

## Development workflow

1. **Review the request, think about it, and brainstorm**
2. **Ask clarifying questions** (when needed)
3. **Think hard and make a plan**
4. **Only when we agree on a plan, create a detailed to-do list** using the `task_progress` parameter
5. **If writing code, add these review tasks at the end of the to-do list:**
   - A. Run `pnpm run typecheck`
   - B. Run `pnpm run test`
   - C. Review against routing pattern: `./src/routes/index.ts` must be declarative
6. **Once we agree on the to-do list, start implementation**
7. **During implementation:**
   - Keep things simple and stick to the requested scope
   - Do NOT over-complicate things
   - Do NOT add unnecessary complexity
8. **At the end, verify:**
   - All tests pass (`pnpm run test`)
   - TypeScript compiles cleanly (`pnpm run typecheck`)
   - Routing pattern is respected (declarative `./src/routes/index.ts`)

## Testing

- Tests live in `./src/__tests__/*.test.ts` and run with Vitest
- The setup file `./src/__tests__/setup.ts` mocks `globalThis.crypto.randomUUID` for Node.js compatibility
- Always run `pnpm run test` after modifying `./src/server.ts`, `./src/config/providers.ts`, or any test file
