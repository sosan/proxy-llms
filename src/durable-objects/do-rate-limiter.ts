import type { Env } from '../interfaces/general'
import { ProviderConfigs } from '../config/providers'

const NEXT_AVAILABLE_AT_KEY = 'nextAvailableAt'

type LockResult = {
  allowed: boolean
  delayMs: number
  scheduledAt: number
  retryAfter: string
  headers: Record<string, string>
}

function getSlotDelayMs(): number {
  return ProviderConfigs.nvidia.rateLimit?.minRetryDelayMs ?? 1500
}

function getMaxQueueDelayMs(): number {
  return ProviderConfigs.nvidia.rateLimit?.maxQueueDelayMs ?? 60000
}

function getRequestsPerMinute(): number {
  return ProviderConfigs.nvidia.rateLimit?.requestsPerMinute ?? 40
}

function buildRateLimitHeaders(delayMs: number, scheduledAt: number): Record<string, string> {
  const retryAfter = String(Math.ceil(delayMs / 1000))
  const resetAtSeconds = String(Math.ceil(scheduledAt / 1000))

  return {
    'Retry-After': retryAfter,
    'RateLimit-Reset': resetAtSeconds,
    'X-RateLimit-Limit': String(getRequestsPerMinute()),
    'X-RateLimit-Remaining': '0',
    'X-RateLimit-Reset': resetAtSeconds,
    'X-RateLimit-Delay-Ms': String(delayMs),
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class RateLimiterDurableObject {
  constructor(
    private readonly state: DurableObjectState,
    private readonly _env: Env
  ) { }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/reserve' && request.method === 'POST') {
      return this.enqueueLock()
    }

    return new Response('Not found', { status: 404 })
  }

  private async enqueueLock(): Promise<Response> {
    const result = await this.reserveLock()
    return Response.json(result, {
      status: result.allowed ? 200 : 429,
      headers: result.allowed ? undefined : result.headers,
    })
  }

  private async reserveLock(): Promise<LockResult> {
    const now = Date.now()
    const slotDelayMs = getSlotDelayMs()
    const maxQueueDelayMs = getMaxQueueDelayMs()
    const currentNextAvailableAt = await this.state.storage.get<number>(NEXT_AVAILABLE_AT_KEY)
    const nextAvailableAt = Math.max(now, currentNextAvailableAt ?? 0)
    const delayMs = nextAvailableAt - now

    if (delayMs > maxQueueDelayMs) {
      const headers = buildRateLimitHeaders(delayMs, nextAvailableAt)
      return {
        allowed: false,
        delayMs,
        scheduledAt: nextAvailableAt,
        retryAfter: headers['Retry-After'],
        headers,
      }
    }

    if (delayMs > 0) {
      await sleep(delayMs)
    }

    await this.state.storage.put(NEXT_AVAILABLE_AT_KEY, nextAvailableAt + slotDelayMs)

    return {
      allowed: true,
      delayMs,
      scheduledAt: nextAvailableAt,
      retryAfter: String(Math.ceil(delayMs / 1000)),
      headers: delayMs > 0 ? buildRateLimitHeaders(delayMs, nextAvailableAt) : {},
    }
  }
}
