# Proxy LLMs Rules

Use this rule file when working in this Cloudflare Worker proxy repository. These rules ensure consistency, security, and proper functionality across the codebase.

## Model Handling

### Alias Management
- Keep client-facing aliases short, stable, and intuitive when possible
- Aliases should be memorable and follow consistent naming patterns
- Maintain backward compatibility - never remove or change existing aliases
- Document new aliases in comments and related documentation

### Model Resolution
- Keep NVIDIA-facing model IDs complete and accurate
- `resolveModel()` must continue to accept both aliases and full IDs
- Model defaults should never override explicit client-provided values
- Preserve the original model ID when forwarding upstream requests
- Handle model resolution failures gracefully with clear error messages

### Configuration
- Model configuration lives in `config/providers.ts`
- Provider-specific settings are properly namespaced
- Default values are clearly documented and justified
- Configuration changes require type checking and testing

## Provider Requests

### URL-Based Routing (New)
- The proxy supports dynamic URL-based routing: `POST /:provider/chat/completions`
- `provider` maps directly to a backend (nvidia, openrouter, lmstudio, llamacpp, ollama)
- The model is resolved from the request body (alias or full upstream model ID)
- No provider env flags (e.g., `USE_NVIDIA_PROVIDER`) are checked — all providers are always available
- Legacy routes (backward compatible): `GET /openai/v1/models`, `GET /claude/v1/models` still work for model discovery

### Request Processing
- The proxy should pass through compatible OpenAI/NVIDIA fields unless they are internal routing fields
- Internal routing fields include: `provider`, unresolved `model`, raw `content`, and raw `messages` after transformation
- Preserve upstream status codes for provider errors where practical
- Transform requests transparently - clients should not notice the proxy layer


### Response Handling
- Forward upstream responses with minimal modification
- Preserve streaming responses with proper SSE formatting
- Maintain OpenAI API compatibility in all responses
- Handle different response formats appropriately

### Error Management
- Preserve meaningful HTTP status codes from upstream providers
- Provide actionable error messages to clients
- Log errors with sufficient context for debugging
- Do not expose internal implementation details in client-facing errors

## Cloudflare Worker Notes

### Performance & Architecture
- Waiting on upstream network fetch does not mean CPU is busy, but clients and upstream providers can still time out
- Streaming is the preferred path for Cline-style agent clients
- Optimize for cold starts and memory efficiency
- Respect Cloudflare Workers runtime limitations

### Durable Objects
- Durable Objects are appropriate for async workflows with polling/SSE/WebSocket
- Do not use Durable Objects for replacing OpenAI-compatible chat responses
- Use Durable Objects only when state persistence is required
- Consider the trade-offs between Durable Objects and simpler approaches

### Environment Constraints
- Code must be compatible with Cloudflare Workers runtime
- Avoid Node.js-specific APIs not available in Workers
- Test in Workers environment before deployment
- Consider edge cases like timeouts, memory limits, and concurrent requests

## Code Quality

### TypeScript
- TypeScript remains strict-friendly and Cloudflare Worker compatible
- Use proper type definitions for all functions and interfaces
- Enable strict type checking in tsconfig.json
- Avoid `any` types - use proper typing or `unknown` with validation

### Testing
- Write tests for new functionality and bug fixes
- Test both success and error paths
- Include integration tests for provider interactions
- Verify OpenAI API compatibility with test clients
- **Critical import rule**: Test imports from `server.ts` **must** use the `.ts` extension (`from '../server.ts'`). Without it, Vitest resolves to `server.js` (legacy) at runtime, which only exports `ProcessorDurableObject` and `default`, causing `TypeError: createResponse is not a function` and similar errors.
- Always run `pnpm run test` after modifying `server.ts` exports or test files

### Documentation
- Document complex logic and architectural decisions
- Keep comments focused on "why" rather than "what"
- Update documentation when changing behavior
- Include examples for non-obvious usage patterns

## Security Considerations

### Secret Management
- Never log or commit secrets, API keys, or tokens
- Use environment variables for sensitive configuration
- Validate and sanitize all user inputs
- Implement proper authentication and authorization

### Network Security
- Use HTTPS for all upstream requests
- Implement proper CORS configuration
- Consider rate limiting and abuse prevention
- Validate upstream URLs and responses

### Error Handling
- Do not expose sensitive information in error messages
- Log security-relevant events appropriately
- Implement proper error boundaries
- Handle edge cases gracefully

## Development Workflow

1. Understand the request and inspect the smallest relevant part of the codebase
2. For ambiguous changes, explain the tradeoff briefly before editing
3. Keep edits scoped to the feature, bug, or cleanup requested
4. Preserve user changes already present in the worktree
5. Run `pnpm run typecheck` before completion for code changes
6. Run `pnpm run test` before finishing any non-trivial change
7. Test changes thoroughly, especially for provider interactions
8. Verify OpenAI compatibility when modifying request/response handling
9. Document any breaking changes or behavioral modifications

## Common Checks

- **Model config change**: Inspect `config/providers.ts` and run `pnpm run typecheck`
- **Route change**: Inspect `server.ts` route registration and run `pnpm run typecheck`
- **Interface change**: Inspect all imports from `interfaces/general.ts`
- **Secrets/config change**: Do not print or commit secret values
- **Streaming change**: Verify SSE formatting and OpenAI compatibility
- **Error handling change**: Test error paths and status code preservation
- **Test import change**: Verify `from '../server.ts'` (not `from '../server'`) in all test files

## Known Issues & Gotchas

### `server.js` vs `server.ts` Import Shadowing
- `server.js` (legacy) exists alongside `server.ts` in the repo root
- Vitest's module resolution prefers `.js` over `.ts` for extensionless imports like `from '../server'`
- `server.js` only exports `ProcessorDurableObject` and `default`, missing `createResponse`, `parseRequestBody`, `RateLimiter`, and `NIMProvider`
- **Always use `from '../server.ts'` in test files** to ensure the correct TypeScript module is loaded
- Symptoms of this issue: `TypeError: createResponse is not a function`, `TypeError: RateLimiter is not a constructor`, etc.
