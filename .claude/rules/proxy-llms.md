# Proxy LLMs Rules

Use this rule file when working in this repository.

## Model Handling

- Keep client-facing aliases short and stable when possible.
- Keep NVIDIA-facing model IDs complete.
- `resolveModel()` must continue to accept both aliases and full IDs.
- Model defaults should never override explicit client-provided values.

## Provider Requests

- The proxy should pass through compatible OpenAI/NVIDIA fields unless they are internal routing fields.
- Internal routing fields include `provider`, unresolved `model`, raw `content`, and raw `messages` after transformation.
- Preserve upstream status codes for NVIDIA errors where practical.
- Use concise logs: request ID, upstream URL, resolved model, upstream status, content type, and duration if available.

## Cloudflare Worker Notes

- Waiting on upstream network fetch does not mean CPU is busy, but clients and upstream providers can still time out.
- Streaming is the preferred path for Cline-style agent clients.
- Durable Objects are appropriate for async workflows with polling/SSE/WebSocket, not for replacing OpenAI-compatible chat responses.

