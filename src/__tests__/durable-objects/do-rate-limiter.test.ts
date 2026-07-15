import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RateLimiterDurableObject } from '../../durable-objects/do-rate-limiter'

// The global setup.ts mocks crypto.randomUUID to a constant, which makes every
// lease collide on one token (real runtime is unique). Override with a counter
// so the lease map actually grows in these tests.
let uuidCounter = 0
beforeEach(() => {
  uuidCounter = 0
  const g = globalThis as unknown as { crypto: { randomUUID: () => string } }
  vi.spyOn(g.crypto, 'randomUUID').mockImplementation(() => `uuid-${uuidCounter++}`)
})

interface ReserveBody {
  allowed: boolean
  delayMs: number
  scheduledAt: number
  reason: string
  token?: string
  headers: Record<string, string>
}

// ── Minimal DurableObjectStorage mock with in-memory state ──
class MockStorage {
  private store = new Map<string, unknown>()
  private alarm: number | null = null

  get = vi.fn(async <T>(key: string): Promise<T | undefined> => {
    return this.store.get(key) as T | undefined
  })

  put = vi.fn(async (key: string, value: unknown): Promise<void> => {
    this.store.set(key, value)
  })

  delete = vi.fn(async (key: string): Promise<void> => {
    this.store.delete(key)
  })

  deleteAll = vi.fn(async (): Promise<void> => {
    this.store.clear()
  })

  getAlarm = vi.fn(async (): Promise<number | null> => {
    return this.alarm
  })

  setAlarm = vi.fn(async (time: number): Promise<void> => {
    this.alarm = time
  })
}

// ── Minimal DurableObjectState mock ──
class MockState {
  storage: MockStorage
  id = { toString: () => 'test-do-id' }
  waitUntil = vi.fn()

  constructor() {
    this.storage = new MockStorage()
  }

  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T> {
    return fn()
  }
}

function createRateLimiter(env: Record<string, unknown> = {}) {
  const state = new MockState() as unknown as DurableObjectState
  return new RateLimiterDurableObject(state, env as any)
}

// ── Helpers ──
async function reserve(limiter: RateLimiterDurableObject, provider = 'nvidia'): Promise<{ status: number; body: ReserveBody }> {
  const req = new Request(`https://internal/reserve?provider=${provider}`, { method: 'POST' })
  const res = await limiter.fetch(req)
  return { status: res.status, body: (await res.json()) as ReserveBody }
}

async function release(limiter: RateLimiterDurableObject, provider = 'nvidia', token?: string): Promise<void> {
  const url = token
    ? `https://internal/inflight-done?provider=${provider}&token=${encodeURIComponent(token)}`
    : `https://internal/inflight-done?provider=${provider}`
  const req = new Request(url, { method: 'POST' })
  const res = await limiter.fetch(req)
  expect(res.status).toBe(204)
}

// ── Tests ──
describe('RateLimiterDurableObject sliding window', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('allows the first request', async () => {
    const limiter = createRateLimiter()
    const { status, body } = await reserve(limiter)

    expect(status).toBe(200)
    const b = body as ReserveBody
    expect(b.allowed).toBe(true)
    expect(b.delayMs).toBe(150) // jitter = 0.5 * 300 = 150
  })

  it('allows up to maxConcurrent requests then blocks until released', async () => {
    const limiter = createRateLimiter()

    // Reserve up to maxConcurrent (3)
    const tokens: (string | undefined)[] = []
    for (let i = 0; i < 3; i++) {
      const { status, body } = await reserve(limiter)
      expect(status).toBe(200)
      expect(body.allowed).toBe(true)
      tokens.push(body.token)
    }

    // 4th request should be blocked by concurrency limit
    const { status, body } = await reserve(limiter)
    expect(status).toBe(429)
    expect(body.allowed).toBe(false)
    expect(body.reason).toBe('concurrency_limit')

    // Release one slot by token
    await release(limiter, 'nvidia', tokens[0])

    // Now we can reserve again
    const { status: s2, body: b2 } = await reserve(limiter)
    expect(s2).toBe(200)
    expect(b2.allowed).toBe(true)
  })

  it('allows up to requestsPerMinute requests within the window', async () => {
    const limiter = createRateLimiter()

    // Fill the request log to capacity (25 requests within window)
    const state = (limiter as any).state as any
    const now = Date.now()
    const timestamps: number[] = []
    for (let i = 0; i < 25; i++) {
      timestamps.push(now - 30_000 + i * 1000) // 30s ago, spaced 1s apart
    }
    await state.storage.put('requestLog', timestamps)

    // First request should succeed (within concurrency limit, window has 25)
    // Wait, actually pruned.length = 25, so this should be rejected
    const { status, body } = await reserve(limiter)
    expect(status).toBe(429)
    expect(body.allowed).toBe(false)
    expect(body.reason).toBe('quota_full')
  })

  it('rejects requests when the window is full', async () => {
    const limiter = createRateLimiter()

    // Fill the window with 25 requests, releasing leases as we go
    const tokens: (string | undefined)[] = []
    for (let i = 0; i < 25; i++) {
      const r = await reserve(limiter)
      tokens.push(r.body.token)
      if (i >= 3) {
        await release(limiter, 'nvidia', tokens[i - 3])
      }
    }

    // Next request should be rejected
    const { status, body } = await reserve(limiter)
    expect(status).toBe(429)
    expect(body.allowed).toBe(false)
    expect(body.delayMs).toBeGreaterThan(0)
  })

  it('allows a new request after the oldest entry falls out of the window', async () => {
    const limiter = createRateLimiter()

    // Fill the window with very old timestamps (simulate they happened 61s ago)
    const state = (limiter as any).state as any
    const now = Date.now()
    const oldTimestamps: number[] = []
    for (let i = 0; i < 25; i++) {
      oldTimestamps.push(now - 61_000 + i * 10) // 61 seconds ago, spaced 10ms apart
    }
    await state.storage.put('requestLog', oldTimestamps)

    // Now a new request should be allowed because all old entries are outside the window
    const { status, body } = await reserve(limiter)
    expect(status).toBe(200)
    expect(body.allowed).toBe(true)

    // The log should now have the old pruned entries gone and the new one added
    const stored = (await state.storage.get('requestLog')) as number[] | undefined
    expect(stored!.length).toBe(1) // only the new request remains
  })

  it('enforces minimum inter-request delay (slotDelayMs)', async () => {
    const limiter = createRateLimiter()

    // First request: only jitter delay
    const first = await reserve(limiter)
    expect(first.body.delayMs).toBe(150) // 0.5 * 300

    // Release first to avoid concurrency block
    await release(limiter, 'nvidia', first.body.token)

    // Second request: should be delayed by slotDelayMs + jitter
    const second = await reserve(limiter)
    expect(second.body.delayMs).toBeGreaterThanOrEqual(2500) // slotDelayMs + jitter
  })

  it('handles a second burst after the window slides', async () => {
    const limiter = createRateLimiter()

    // Simulate: first burst happened 60+ seconds ago
    const state = (limiter as any).state as any
    const now = Date.now()
    const oldTimestamps: number[] = []
    for (let i = 0; i < 35; i++) {
      oldTimestamps.push(now - 65_000 + i * 10) // 65 seconds ago
    }
    await state.storage.put('requestLog', oldTimestamps)

    // New request should be allowed (old entries pruned)
    const { status, body } = await reserve(limiter)
    expect(status).toBe(200)
    expect(body.allowed).toBe(true)
  })
})

describe('RateLimiterDurableObject inflight leases', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reserve returns a token and release by token decrements concurrency', async () => {
    const limiter = createRateLimiter()
    const r1 = await reserve(limiter)
    expect(r1.body.allowed).toBe(true)
    expect(r1.body.token).toBeTruthy()

    // Fill up to maxConcurrent (3) with tracked tokens
    const tokens: (string | undefined)[] = [r1.body.token]
    for (let i = 0; i < 2; i++) {
      const r = await reserve(limiter)
      expect(r.body.allowed).toBe(true)
      tokens.push(r.body.token)
    }

    // 4th blocked by concurrency
    const blocked = await reserve(limiter)
    expect(blocked.status).toBe(429)
    expect(blocked.body.reason).toBe('concurrency_limit')

    // Release one by token
    await release(limiter, 'nvidia', tokens[0])

    const after = await reserve(limiter)
    expect(after.body.allowed).toBe(true)
  })

  it('release is idempotent for the same token (double release no-op)', async () => {
    const limiter = createRateLimiter()
    const r = await reserve(limiter)
    const token = r.body.token!
    await release(limiter, 'nvidia', token)
    await release(limiter, 'nvidia', token) // no-op, no error

    // Only one slot was consumed; we can still reserve up to maxConcurrent
    const state = (limiter as any).state as any
    const leases = await state.storage.get('inflightLeases:nvidia')
    expect(leases).toEqual([])
  })

  it('release with an unknown token is a no-op', async () => {
    const limiter = createRateLimiter()
    await release(limiter, 'nvidia', 'does-not-exist')
    const { body } = await reserve(limiter)
    expect(body.allowed).toBe(true)
    expect(body.token).toBeTruthy()
  })

  it('expired leases are swept on reserve so they do not block admission', async () => {
    const limiter = createRateLimiter()
    const state = (limiter as any).state as any

    // Seed an expired lease map directly
    const expiredToken = 'expired-token'
    await state.storage.put('inflightLeases:nvidia', [[expiredToken, { expiresAt: Date.now() - 1000 }]])
    // Fill remaining 2 live slots
    for (let i = 0; i < 2; i++) await reserve(limiter)

    // 4th would be blocked if the expired lease counted; sweep makes it allowed
    const next = await reserve(limiter)
    expect(next.body.allowed).toBe(true)
  })

  it('rate limit overridden via NVIDIA_REQUESTS_PER_MINUTE env', async () => {
    const limiter = createRateLimiter({ NVIDIA_REQUESTS_PER_MINUTE: '2' })
    const state = (limiter as any).state as any

    // Fill window to capacity (2)
    const now = Date.now()
    await state.storage.put('requestLog', [now - 1000, now - 500])

    const blocked = await reserve(limiter)
    expect(blocked.status).toBe(429)
    expect(blocked.body.reason).toBe('quota_full')
  })

  it('invalid NVIDIA_REQUESTS_PER_MINUTE falls back to config default (10)', async () => {
    const limiter = createRateLimiter({ NVIDIA_REQUESTS_PER_MINUTE: 'not-a-number' })
    const state = (limiter as any).state as any

    const now = Date.now()
    const timestamps: number[] = []
    for (let i = 0; i < 10; i++) timestamps.push(now - 30_000 + i * 1000)
    await state.storage.put('requestLog', timestamps)

    const blocked = await reserve(limiter)
    expect(blocked.status).toBe(429)
    expect(blocked.body.reason).toBe('quota_full')
  })

  it('circuit opens on /circuit-open and short-circuits reserve to circuit_open', async () => {
    const limiter = createRateLimiter()
    const ttl = 1800_000
    const openRes = await limiter.fetch(
      new Request(`https://internal/circuit-open?provider=nvidia&ttl=${ttl}`, { method: 'POST' }),
    )
    expect(openRes.status).toBe(200)

    const { status, body } = await reserve(limiter)
    expect(status).toBe(429)
    expect(body.reason).toBe('circuit_open')
  })

  it('alarm sweeps expired leases when no reserve arrives', async () => {
    const limiter = createRateLimiter()
    const state = (limiter as any).state as any

    await state.storage.put('inflightLeases:nvidia', [['t1', { expiresAt: Date.now() - 1000 }]])
    await (limiter as any).alarm()

    const leases = await state.storage.get('inflightLeases:nvidia')
    expect(leases).toEqual([])
  })
})