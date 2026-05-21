# Development Workflow

## Brief overview

Standard development commands and workflow for the proxy-llms project.

## Local commands

- Install dependencies: `npm install`
- Run locally: `npm run dev`
- Typecheck: `npm run typecheck`
- Run tests: `npm run test`
- Run tests in watch mode: `npm run test:watch`
- Run tests with coverage: `npm run test:coverage`
- Deploy: `npm run deploy`

## Validation script

The `validate` script runs all checks in sequence:
1. `lockfile-lint`
2. `oxlint`
3. `tsc --noEmit`
4. `vitest run`

```bash
npm run validate
```

## Development workflow

1. **Review the request, think about it, and brainstorm**
2. **Ask clarifying questions** (when needed)
3. **Think hard and make a plan**
4. **Only when we agree on a plan, create a detailed to-do list** using the `task_progress` parameter
5. **If writing code, add these review tasks at the end of the to-do list:**
   - A. Run `npm run typecheck`
   - B. Run `npm run test`
   - C. Review against routing pattern: `routes/index.ts` must be declarative
6. **Once we agree on the to-do list, start implementation**
7. **During implementation:**
   - Keep things simple and stick to the requested scope
   - Do NOT over-complicate things
   - Do NOT add unnecessary complexity
8. **At the end, verify:**
   - All tests pass (`npm run test`)
   - TypeScript compiles cleanly (`npm run typecheck`)
   - Routing pattern is respected (declarative `routes/index.ts`)

## Testing

- Tests live in `__tests__/*.test.ts` and run with Vitest
- The setup file `__tests__/setup.ts` mocks `globalThis.crypto.randomUUID` for Node.js compatibility
- **Critical import gotcha**: Because `server.js` (legacy) exists alongside `server.ts`, test imports **must** use the `.ts` extension (e.g., `from '../server.ts'`). Without it, Vitest resolves to `server.js` at runtime
- Always run `npm run test` after modifying `server.ts`, `config/providers.ts`, or any test file
