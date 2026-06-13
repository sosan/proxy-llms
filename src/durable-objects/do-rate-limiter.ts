import type { Env } from '../interfaces/general'
import { ProviderConfigs } from '../config/providers'

const LAST_SCHEDULED_AT_KEY = 'lastScheduledAt'

type LockResult = {
  allowed: boolean
  delayMs: number
  scheduledAt: number
  retryAfter: string
  headers: Record<string, string>
}

function getSlotDelayMs(): number {
  return ProviderConfigs.nvidia.rateLimit?.minRetryDelayMs ?? 1600
}

function getMaxQueueDelayMs(): number {
  return ProviderConfigs.nvidia.rateLimit?.maxQueueDelayMs ?? 60000
}

function getRequestsPerMinute(): number {
  return ProviderConfigs.nvidia.rateLimit?.requestsPerMinute ?? 40
}

function buildRateLimitHeaders(delayMs: number, scheduledAt: number): Record<string, string> {
  const retryAfter = String(Math.max(1, Math.ceil(delayMs / 1000)))
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

export class RateLimiterDurableObject {
  constructor(
    private readonly state: DurableObjectState,
    private readonly _env: Env
  ) {}

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

    const result = await this.state.blockConcurrencyWhile(async () => {
      const last = (await this.state.storage.get<number>(LAST_SCHEDULED_AT_KEY)) ?? 0
      const scheduledAt = Math.max(now, last + slotDelayMs)
      const delayMs = scheduledAt - now

      await this.state.storage.put(LAST_SCHEDULED_AT_KEY, scheduledAt)

      return { scheduledAt, delayMs }
    })

    if (result.delayMs > maxQueueDelayMs) {
      const headers = buildRateLimitHeaders(result.delayMs, result.scheduledAt)
      return {
        allowed: false,
        delayMs: result.delayMs,
        scheduledAt: result.scheduledAt,
        retryAfter: headers['Retry-After'],
        headers,
      }
    }

    const headers = buildRateLimitHeaders(result.delayMs, result.scheduledAt)

    return {
      allowed: true,
      delayMs: result.delayMs,
      scheduledAt: result.scheduledAt,
      retryAfter: headers['Retry-After'],
      headers,
    }
  }
}
