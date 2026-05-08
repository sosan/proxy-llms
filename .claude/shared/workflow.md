# Development Workflow

1. Understand the request and inspect the smallest relevant part of the codebase.
2. For ambiguous changes, explain the tradeoff briefly before editing.
3. Keep edits scoped to the feature, bug, or cleanup requested.
4. Preserve user changes already present in the worktree.
5. For code changes, run `npm run typecheck` before completion.
6. For OpenAI-compatible behavior, check:
   - aliases resolve to full NVIDIA model IDs;
   - `/openai/v1/models` returns IDs the client can select;
   - streaming keeps `text/event-stream`;
   - provider errors preserve useful HTTP status codes.
7. At the end, summarize changed files and verification.

## Common Checks

- Model config change: inspect `config/providers.ts` and run `npm run typecheck`.
- Route change: inspect `server.ts` route registration and run `npm run typecheck`.
- Interface change: inspect all imports from `interfaces/general.ts`.
- Secrets/config change: do not print or commit secret values.

