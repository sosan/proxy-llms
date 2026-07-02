import type { Context, Next } from 'hono'
import type { Env } from '../interfaces/general'

/**
 * Path-based proxy token auth middleware.
 *
 * Validates the first path segment against env.PROXY_API_KEY using constant-time
 * comparison. If PROXY_API_KEY is unset or empty, auth is disabled and all
 * requests pass through.
 */
export const proxyAuthMiddleware = async (c: Context<{ Bindings: Env }>, next: Next) => {
  const proxyApiKey = c.env.PROXY_API_KEY

  // Auth disabled — pass all requests through
  if (!proxyApiKey) {
    await next()
    return
  }

  const path = c.req.path
  // Extract first path segment (e.g. "/abc123/v1/chat/completions" → "abc123")
  const segments = path.split('/').filter(Boolean)
  const proxyToken = segments[0]

  if (!proxyToken) {
    return c.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const isValid = timingSafeEqual(proxyToken, proxyApiKey)

  if (!isValid) {
    return c.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await next()
}

/**
 * Constant-time string comparison to prevent timing attacks.
 * Uses crypto.subtle.timingSafeEqual where available (Cloudflare Workers),
 * falls back to plain string comparison in other environments.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false
  }
  // Cloudflare Workers provides crypto.subtle.timingSafeEqual
  if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.timingSafeEqual) {
    const encoder = new TextEncoder()
    return crypto.subtle.timingSafeEqual(encoder.encode(a), encoder.encode(b))
  }
  // Node.js / test environment fallback
  return a === b
}
