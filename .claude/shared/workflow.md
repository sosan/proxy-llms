# Development Workflow

This document outlines the standard development workflow for this Cloudflare Worker proxy project. Following these practices ensures consistency, quality, and maintainability.

## Core Development Process

### 1. Understanding & Analysis
- **Understand the request**: Carefully read and understand the user's requirements
- **Inspect relevant code**: Look at the smallest relevant part of the codebase first
- **Identify impact**: Determine which files and systems will be affected
- **Consider tradeoffs**: For ambiguous changes, explain the tradeoff briefly before editing

### 2. Implementation Strategy
- **Keep changes scoped**: Make edits focused on the specific feature, bug, or cleanup requested
- **Preserve existing work**: Maintain user changes already present in the worktree
- **Follow patterns**: Use existing code patterns and architectural decisions
- **Think incrementally**: Break complex changes into smaller, testable steps

### 3. Code Quality
- **Type safety**: Run `pnpm run typecheck` before completion for code changes
- **Testing**: Run `pnpm run test` before finishing any non-trivial change. Test both success and error paths
- **Documentation**: Update relevant documentation when behavior changes
- **Code review**: Consider security implications and edge cases

### 4. Verification
- **OpenAI compatibility**: Ensure changes maintain OpenAI API compatibility
- **Error handling**: Verify error paths work correctly
- **Performance**: Consider performance implications for Cloudflare Workers
- **Security**: Check for security vulnerabilities and data exposure

## Specific Workflows

### Model Configuration Changes
1. **Inspect configuration**: Review `config/providers.ts` for current model setup
2. **Understand aliases**: Check existing model aliases and their mappings
3. **Update configuration**: Add or modify model aliases and provider settings
4. **Type check**: Run `pnpm run typecheck` to verify TypeScript correctness
5. **Test resolution**: Verify model resolution works with both aliases and full IDs
6. **Run tests**: Run `pnpm run test` to ensure no regressions
7. **Document changes**: Update any relevant documentation

### Route Changes
1. **Review routes**: Inspect `server.ts` for current route registration
2. **Understand handlers**: Review existing route handlers and patterns
3. **Implement changes**: Add or modify routes following existing patterns
4. **Type check**: Run `pnpm run typecheck` to verify TypeScript correctness
5. **Test endpoints**: Verify new or modified routes work correctly
6. **Check compatibility**: Ensure OpenAI API compatibility is maintained

### Interface Changes
1. **Review interfaces**: Inspect `interfaces/general.ts` for current type definitions
2. **Check imports**: Find all files importing the affected interfaces
3. **Update interfaces**: Modify type definitions as needed
4. **Update implementations**: Update all code using the changed interfaces
5. **Type check**: Run `pnpm run typecheck` to verify all changes
6. **Test thoroughly**: Ensure all implementations work with new interfaces

### Streaming Response Changes
1. **Understand SSE**: Review current Server-Sent Events implementation
2. **Check formatting**: Verify proper SSE formatting in responses
3. **Test streaming**: Test with streaming clients to ensure compatibility
4. **Verify headers**: Ensure `text/event-stream` content type is preserved
5. **Handle errors**: Test error handling in streaming contexts
6. **Performance check**: Consider performance implications for streaming

### Error Handling Changes
1. **Review errors**: Inspect current error handling in `errors/provider-error.ts`
2. **Check status codes**: Verify HTTP status codes are preserved from upstream
3. **Test error paths**: Test various error scenarios
4. **Verify messages**: Ensure error messages are actionable and safe
5. **Check logging**: Verify errors are logged with sufficient context
6. **Client testing**: Test error responses with client applications

### Test Import Gotcha
- **Critical**: Test imports from `server.ts` **must** use the `.ts` extension: `from '../server.ts'`
- Without the `.ts` extension, Vitest resolves to `server.js` (legacy) at runtime, which only exports `ProcessorDurableObject` and `default`
- This causes `TypeError: createResponse is not a function` and similar errors
- Always verify test imports use `../server.ts` when importing from `server.ts`

## OpenAI Compatibility Checklist

When modifying request/response handling, verify:

### Request Compatibility
- [ ] Aliases resolve to full NVIDIA model IDs correctly
- [ ] `/openai/v1/models` returns IDs the client can select
- [ ] Request format matches OpenAI API specification
- [ ] Headers are properly forwarded and transformed
- [ ] Authentication works as expected

### Response Compatibility
- [ ] Streaming responses keep `text/event-stream` content type
- [ ] Response format matches OpenAI API specification
- [ ] Chunked responses are properly formatted
- [ ] Non-streaming responses are complete and correct
- [ ] Response headers are appropriate

### Error Compatibility
- [ ] Provider errors preserve useful HTTP status codes
- [ ] Error messages follow OpenAI error format
- [ ] Error responses are parseable by OpenAI clients
- [ ] Rate limit errors are properly handled
- [ ] Timeout errors are appropriately managed

## Security Considerations

### Secret Management
- Never print or commit secret values
- Use environment variables for sensitive configuration
- Validate that `.env` and `.local` remain untracked
- Check that no secrets are exposed in error messages

### Input Validation
- Validate all user inputs before processing
- Sanitize data to prevent injection attacks
- Implement proper authentication and authorization
- Check for malicious input patterns

### Network Security
- Use HTTPS for all upstream requests
- Implement proper CORS configuration
- Consider rate limiting and abuse prevention
- Validate upstream URLs and responses

## Testing Guidelines

### Unit Testing
- Test individual functions and components
- Cover both success and error paths
- Mock external dependencies appropriately
- Verify edge cases and boundary conditions
- Use `from '../server.ts'` (not `from '../server'`) for imports from `server.ts`

### Integration Testing
- Test interactions between components
- Verify provider integrations work correctly
- Test end-to-end request/response flows
- Validate OpenAI API compatibility

### Manual Testing
- Test with real client applications
- Verify streaming responses work correctly
- Test error handling with various scenarios
- Check performance under load

## Common Pitfalls to Avoid

### Configuration Issues
- Don't hardcode model IDs or API keys
- Don't break existing model aliases
- Don't ignore TypeScript errors
- Don't forget to update documentation

### Performance Issues
- Don't create unnecessary blocking operations
- Don't ignore Cloudflare Workers runtime limitations
- Don't overuse Durable Objects for simple cases
- Don't forget about cold start optimization

### Security Issues
- Don't log sensitive information
- Don't expose internal implementation details
- Don't skip input validation
- Don't use insecure protocols

### Import Issues
- Don't use `from '../server'` in tests — always use `from '../server.ts'`
- Don't forget that `server.js` (legacy) shadows `server.ts` at runtime

## Completion Checklist

Before considering a task complete, verify:

- [ ] Code changes are minimal and focused
- [ ] TypeScript type checking passes (`pnpm run typecheck`)
- [ ] All tests pass (`pnpm run test`)
- [ ] OpenAI API compatibility is maintained
- [ ] Error handling is robust and tested
- [ ] Security best practices are followed
- [ ] Documentation is updated if needed
- [ ] No secrets or sensitive data are exposed
- [ ] Performance implications are considered
- [ ] Edge cases are handled appropriately
- [ ] Changes are tested thoroughly

## Post-Completion

After completing changes:
1. **Summarize changes**: List all files that were modified
2. **Explain verification**: Describe how changes were tested
3. **Document impact**: Explain any breaking changes or behavioral modifications
4. **Suggest next steps**: Recommend any follow-up actions or improvements
5. **Clean up**: Remove any temporary files or debugging code

## Getting Help

If you encounter issues:
1. Review existing code patterns in the repository
2. Check the rules in `.claude/rules/proxy-llms.md`
3. Consult the project documentation
4. Use `/security-review` to check security implications
5. Use `/pattern-review` to verify architectural consistency
