import type { Env } from '../interfaces/general'
import { ProviderConfigs } from '../config/providers'

const REQUEST_LOG_KEY = 'requestLog'
const WINDOW_MS = 60_000

type LockResult = {
  allowed: boolean
  delayMs: number
  scheduledAt: number
  headers: Record<string, string>
}

function getSlotDelayMs(provider: string): number {
  return ProviderConfigs[provider]?.rateLimit?.minRetryDelayMs ?? 1600
}

function getMaxQueueDelayMs(provider: string): number {
  return ProviderConfigs[provider]?.rateLimit?.maxQueueDelayMs ?? 60000
}

function getRequestsPerMinute(provider: string): number {
  return ProviderConfigs[provider]?.rateLimit?.requestsPerMinute ?? 40
}

function buildRateLimitHeaders(delayMs: number, scheduledAt: number, provider: string): Record<string, string> {
  const retryAfter = String(Math.max(1, Math.ceil(delayMs / 1000)))
  const resetAtSeconds = String(Math.ceil(scheduledAt / 1000))

  return {
    'Retry-After': retryAfter,
    'RateLimit-Reset': resetAtSeconds,
    'X-RateLimit-Limit': String(getRequestsPerMinute(provider)),
    'X-RateLimit-Remaining': '0',
    'X-RateLimit-Reset': resetAtSeconds,
    'X-RateLimit-Delay-Ms': String(delayMs),
  }
}

/**
 * Sliding window rate limiter using a request log of timestamps.
 * Stores an array of {timestamp, id} entries and prunes entries older than
 * the sliding window (60s).  Enforces a per-minute request cap and a
 * minimum inter-request delay (slotDelayMs) to smooth burst traffic.
 */
export class RateLimiterDurableObject {
  constructor(
    private readonly state: DurableObjectState,
    private readonly _env: Env
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/reserve' && request.method === 'POST') {
      return this.enqueueLock(url)
    }

    return new Response('Not found', { status: 404 })
  }

  private async enqueueLock(url: URL): Promise<Response> {
    const result = await this.reserveLock(url)
    return Response.json(result, {
      status: result.allowed ? 200 : 429,
      headers: result.allowed ? undefined : result.headers,
    })
  }

  private async reserveLock(url: URL): Promise<LockResult> {
    const now = Date.now()
    const provider = url.searchParams.get('provider') ?? 'nvidia'
    const slotDelayMs = getSlotDelayMs(provider)
    const maxQueueDelayMs = getMaxQueueDelayMs(provider)
    const requestsPerMinute = getRequestsPerMinute(provider)

    const result = await this.state.blockConcurrencyWhile(async () => {
      // ── sliding window: load, prune, count ──────────────────────────────
      const log = (await this.state.storage.get<Array<number>>(REQUEST_LOG_KEY)) ?? []
      const windowStart = now - WINDOW_MS
      const pruned: number[] = []
      for (const ts of log) {
        if (ts >= windowStart) pruned.push(ts)
      }
      const currentCount = pruned.length

      // ── compute when this request would be scheduled ─────────────────────
      const lastScheduledAt = pruned.length > 0 ? Math.max(...pruned) : 0
      const earliestSlot = Math.max(now, lastScheduledAt + slotDelayMs)
      const delayMs = earliestSlot - now

      // ── enforce per-minute cap ──────────────────────────────────────────
      if (currentCount >= requestsPerMinute) {
        // Window is full; compute when the oldest entry in window expires
        const oldestInWindow = pruned[0]
        const waitUntil = oldestInWindow + WINDOW_MS
        const waitMs = waitUntil - now
        return {
          allowed: false,
          delayMs: waitMs,
          scheduledAt: waitUntil,
          headers: buildRateLimitHeaders(waitMs, waitUntil, provider),
        }
      }

      // ── allowed: record the timestamp and persist ─────────────────────────
      pruned.push(earliestSlot)
      await this.state.storage.put(REQUEST_LOG_KEY, pruned)

      return {
        allowed: true,
        delayMs,
        scheduledAt: earliestSlot,
        headers: buildRateLimitHeaders(delayMs, earliestSlot, provider),
      }
    })

    return result
  }
}
