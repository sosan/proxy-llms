import type { Env } from '../interfaces/general'
import { ProviderConfigs } from '../config/providers'

// --- Storage keys ------------------------------------------------------------
const REQUEST_LOG_KEY = 'requestLog'
const CIRCUIT_KEY = 'circuitOpenUntil'
const LEASES_KEY = 'inflightLeases'

// --- Constants ---------------------------------------------------------------
const WINDOW_MS = 60_000
// Bridges the 980s upstream response-timeout; an in-flight lease self-heals via
// sweep/alarm even if the release call never arrives (disconnect, eviction).
const LEASE_TTL_MS = 1000_000
const MIN_REQUESTS_PER_MINUTE = 1

// --- Types -------------------------------------------------------------------
type LockReason =
  | 'circuit_open'
  | 'concurrency_limit'
  | 'quota_full'
  | 'queue_full'
  | 'scheduled'

export type LockResult = {
  allowed: boolean
  delayMs: number
  scheduledAt: number
  reason: LockReason
  headers: Record<string, string>
}

// --- ProviderConfig helpers ---------------------------------------------------
function getSlotDelayMs(p: string): number {
  return ProviderConfigs[p]?.rateLimit?.minRetryDelayMs ?? 2500
}

function getMaxQueueDelayMs(p: string): number {
  return ProviderConfigs[p]?.rateLimit?.maxQueueDelayMs ?? 30_000
}

function getRequestsPerMinute(p: string, env?: Env): number {
  const fromEnv = env?.NVIDIA_MAX_REQUESTS_PER_MINUTE
  const parsed = Number(fromEnv)
  if (fromEnv && fromEnv.trim() !== '' && Number.isFinite(parsed) && parsed >= MIN_REQUESTS_PER_MINUTE) {
    return Math.floor(parsed)
  }
  return ProviderConfigs[p]?.rateLimit?.requestsPerMinute ?? 25
}

function getCircuitTtlMs(p: string): number {
  return ProviderConfigs[p]?.rateLimit?.circuitBreakerTtlMs ?? 120_000
}

function getJitterMs(p: string): number {
  return ProviderConfigs[p]?.rateLimit?.jitterMs ?? 300
}

function getMaxConcurrent(p: string): number {
  return ProviderConfigs[p]?.rateLimit?.maxConcurrent ?? 3
}

// --- Header builder -----------------------------------------------------------
function buildRateLimitHeaders(
  delayMs: number,
  scheduledAt: number,
  provider: string,
  extra?: Record<string, string>
): Record<string, string> {
  return {
    'Retry-After': String(Math.max(1, Math.ceil(delayMs / 1000))),
    'RateLimit-Reset': String(Math.ceil(scheduledAt / 1000)),
    'X-RateLimit-Limit': String(getRequestsPerMinute(provider)),
    'X-RateLimit-Remaining': '0',
    'X-RateLimit-Reset': String(Math.ceil(scheduledAt / 1000)),
    'X-RateLimit-Delay-Ms': String(Math.round(delayMs)),
    ...extra,
  }
}

// --- Durable Object -----------------------------------------------------------
export class RateLimiterDurableObject {
  constructor(
    private readonly state: DurableObjectState,
    private readonly _env: Env
  ) { }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    switch (true) {
      case url.pathname === '/reserve' && request.method === 'POST':
        return this.handleReserve(url)

      case url.pathname === '/inflight-done' && request.method === 'POST':
        return this.handleInflightDone(url)

      case url.pathname === '/circuit-open' && request.method === 'POST':
        return this.handleCircuitOpen(url)

      case url.pathname === '/circuit-close' && request.method === 'POST':
        return this.handleCircuitClose(url)

      case url.pathname === '/status' && request.method === 'GET':
        return this.handleStatus(url)

      default:
        return new Response('Not found', { status: 404 })
    }
  }

  // -- /reserve ----------------------------------------------------------------
  private async handleReserve(url: URL): Promise<Response> {
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
    const requestsPerMinute = getRequestsPerMinute(provider, this._env)
    const jitterMs = getJitterMs(provider)

    return this.state.blockConcurrencyWhile(async () => {
      // Sweep expired leases before evaluating any gate (self-heal on disconnect/eviction).
      const leases = await this.sweepLeases(provider, now)

      // -- 1. Circuit breaker -------------------------------------------------
      // 429
      const circuitKey = `${CIRCUIT_KEY}:${provider}`
      const openUntil = await this.state.storage.get<number>(circuitKey)

      if (openUntil && now < openUntil) {
        const waitMs = openUntil - now
        return {
          allowed: false,
          delayMs: waitMs,
          scheduledAt: openUntil,
          reason: 'circuit_open',
          headers: buildRateLimitHeaders(waitMs, openUntil, provider, {
            'X-RateLimit-Reason': 'circuit_open',
          }),
        }
      }
      // clean
      if (openUntil) await this.state.storage.delete(circuitKey)

      // -- 2. Concurrency cap (count non-expired leases) ----------------------
      const maxConcurrent = getMaxConcurrent(provider)
      const inflight = leases.size

      if (inflight >= maxConcurrent) {
        const estimatedWait = slotDelayMs + jitterMs
        const scheduledAt = now + estimatedWait
        return {
          allowed: false,
          delayMs: estimatedWait,
          scheduledAt,
          reason: 'concurrency_limit',
          headers: buildRateLimitHeaders(estimatedWait, scheduledAt, provider, {
            'X-RateLimit-Reason': 'concurrency_limit',
          }),
        }
      }

      // -- 3. Sliding window
      const log = (await this.state.storage.get<number[]>(REQUEST_LOG_KEY)) ?? []
      const windowStart = now - WINDOW_MS
      const pruned = log.filter(ts => ts >= windowStart)

      if (pruned.length >= requestsPerMinute) {
        const waitUntil = pruned[0] + WINDOW_MS
        const waitMs = waitUntil - now
        return {
          allowed: false,
          delayMs: waitMs,
          scheduledAt: waitUntil,
          reason: 'quota_full',
          headers: buildRateLimitHeaders(waitMs, waitUntil, provider, {
            'X-RateLimit-Reason': 'quota_full',
          }),
        }
      }

      // -- 4. Slot scheduling con jitter --------------------------------------
      const jitter = Math.random() * jitterMs
      const lastScheduledAt = pruned.length > 0 ? Math.max(...pruned) : 0
      const earliestSlot = Math.max(now, lastScheduledAt + slotDelayMs) + jitter
      const delayMs = earliestSlot - now

      if (delayMs > maxQueueDelayMs) {
        return {
          allowed: false,
          delayMs,
          scheduledAt: earliestSlot,
          reason: 'queue_full',
          headers: buildRateLimitHeaders(delayMs, earliestSlot, provider, {
            'X-RateLimit-Reason': 'queue_full',
          }),
        }
      }

      // -- 5. Reserve ---------------------------------------
      pruned.push(earliestSlot)
      await this.state.storage.put(REQUEST_LOG_KEY, pruned)

      const token = crypto.randomUUID()
      const expiresAt = now + LEASE_TTL_MS
      leases.set(token, { expiresAt })
      await this.state.storage.put(`${LEASES_KEY}:${provider}`, this.serializeLeases(leases))
      await this.scheduleLeaseAlarm(leases)

      return {
        allowed: true,
        delayMs,
        scheduledAt: earliestSlot,
        reason: 'scheduled',
        token,
        headers: buildRateLimitHeaders(delayMs, earliestSlot, provider),
      }
    })
  }

  // -- lease helpers -----------------------------------------------------------
  private async loadLeases(provider: string): Promise<Map<string, { expiresAt: number }>> {
    const raw = await this.state.storage.get<Array<[string, { expiresAt: number }]>>(`${LEASES_KEY}:${provider}`)
    return new Map(raw ?? [])
  }

  private serializeLeases(leases: Map<string, { expiresAt: number }>): Array<[string, { expiresAt: number }]> {
    return [...leases.entries()]
  }

  /** Drops leases whose TTL has elapsed. Returns the pruned (active) map. */
  private async sweepLeases(provider: string, now: number): Promise<Map<string, { expiresAt: number }>> {
    const leases = await this.loadLeases(provider)
    let changed = false
    for (const [token, lease] of leases) {
      if (lease.expiresAt <= now) {
        leases.delete(token)
        changed = true
      }
    }
    if (changed) {
      await this.state.storage.put(`${LEASES_KEY}:${provider}`, this.serializeLeases(leases))
    }
    return leases
  }

  /** Schedules an alarm for the soonest lease expiry so expired leases are
   *  swept even when no new /reserve arrives (covers the idle-evicted DO). */
  private async scheduleLeaseAlarm(leases: Map<string, { expiresAt: number }>): Promise<void> {
    if (leases.size === 0) return
    const soonest = Math.min(...[...leases.values()].map(l => l.expiresAt))
    const existing = await this.state.storage.getAlarm()
    if (existing == null || soonest < existing) {
      await this.state.storage.setAlarm(soonest)
    }
  }

  // -- alarm: sweep expired leases and reschedule if any remain ---------------
  async alarm(): Promise<void> {
    const provider = 'nvidia'
    const leases = await this.sweepLeases(provider, Date.now())
    if (leases.size > 0) {
      await this.scheduleLeaseAlarm(leases)
    }
  }

  // -- /inflight-done ----------------------------------------------------------
  private async handleInflightDone(url: URL): Promise<Response> {
    const provider = url.searchParams.get('provider') ?? 'nvidia'
    const token = url.searchParams.get('token')

    await this.state.blockConcurrencyWhile(async () => {
      const leases = await this.loadLeases(provider)
      if (token && leases.has(token)) {
        leases.delete(token)
        await this.state.storage.put(`${LEASES_KEY}:${provider}`, this.serializeLeases(leases))
      }
    })

    return new Response(null, { status: 204 })
  }

  // -- /circuit-open -----------------------------------------------------------
  private async handleCircuitOpen(url: URL): Promise<Response> {
    const provider = url.searchParams.get('provider') ?? 'nvidia'
    const ttlMs = Number(url.searchParams.get('ttl') ?? getCircuitTtlMs(provider))
    const openUntil = Date.now() + ttlMs

    await this.state.storage.put(`${CIRCUIT_KEY}:${provider}`, openUntil)

    return Response.json({ openUntil, ttlMs }, { status: 200 })
  }

  // -- /circuit-close ----------------------------------------------------------
  private async handleCircuitClose(url: URL): Promise<Response> {
    const provider = url.searchParams.get('provider') ?? 'nvidia'
    await this.state.storage.delete(`${CIRCUIT_KEY}:${provider}`)
    return new Response(null, { status: 204 })
  }

  // -- /status -----------------------------------------------------------------
  private async handleStatus(url: URL): Promise<Response> {
    const provider = url.searchParams.get('provider') ?? 'nvidia'
    const now = Date.now()

    const [log, openUntil, leases] = await Promise.all([
      this.state.storage.get<number[]>(REQUEST_LOG_KEY),
      this.state.storage.get<number>(`${CIRCUIT_KEY}:${provider}`),
      this.loadLeases(provider),
    ])

    const pruned = (log ?? []).filter(ts => ts >= now - WINDOW_MS)
    const circuitOpen = openUntil != null && now < openUntil
    const leasesArr = [...leases.values()]
    const activeLeases = leasesArr.filter(l => l.expiresAt > now).length

    return Response.json({
      provider,
      timestamp: new Date(now).toISOString(),
      slidingWindow: {
        requestsInWindow: pruned.length,
        limit: getRequestsPerMinute(provider, this._env),
        windowMs: WINDOW_MS,
        oldestSlot: pruned.length > 0 ? new Date(pruned[0]).toISOString() : null,
        nextSlot: pruned.length > 0
          ? new Date(Math.max(...pruned) + getSlotDelayMs(provider)).toISOString()
          : new Date(now).toISOString(),
      },
      concurrency: {
        inflight: activeLeases,
        max: getMaxConcurrent(provider),
      },
      circuitBreaker: {
        open: circuitOpen,
        openUntil: openUntil ? new Date(openUntil).toISOString() : null,
        remainingMs: circuitOpen ? openUntil! - now : 0,
      },
      config: {
        requestsPerMinute: getRequestsPerMinute(provider, this._env),
        minRetryDelayMs: getSlotDelayMs(provider),
        maxQueueDelayMs: getMaxQueueDelayMs(provider),
        jitterMs: getJitterMs(provider),
        circuitBreakerTtlMs: getCircuitTtlMs(provider),
      },
    })
  }
}
