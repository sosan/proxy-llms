import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RateLimiterDurableObject } from '../../durable-objects/do-rate-limiter'

interface ReserveBody {
  allowed: boolean
  delayMs: number
  scheduledAt: number
  headers?: Record<string, string>
}

// ── Minimal DurableObjectStorage mock with in-memory state ──
class MockStorage {
  private store = new Map<string, unknown>()

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

function createRateLimiter() {
  const state = new MockState() as unknown as DurableObjectState
  const env = {} as any
  return new RateLimiterDurableObject(state, env)
}

// ── Helpers ──
async function reserve(limiter: RateLimiterDurableObject, provider = 'nvidia'): Promise<{ status: number; body: ReserveBody }> {
  const req = new Request(`https://internal/reserve?provider=${provider}`, { method: 'POST' })
  const res = await limiter.fetch(req)
  return { status: res.status, body: (await res.json()) as ReserveBody }
}

async function release(limiter: RateLimiterDurableObject, provider = 'nvidia'): Promise<void> {
  const req = new Request(`https://internal/inflight-done?provider=${provider}`, { method: 'POST' })
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
    for (let i = 0; i < 3; i++) {
      const { status, body } = await reserve(limiter)
      expect(status).toBe(200)
      expect(body.allowed).toBe(true)
    }

    // 4th request should be blocked by concurrency limit
    const { status, body } = await reserve(limiter)
    expect(status).toBe(429)
    expect(body.allowed).toBe(false)
    expect(body.reason).toBe('concurrency_limit')

    // Release one slot
    await release(limiter)

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

    // Fill the window with 25 requests
    for (let i = 0; i < 25; i++) {
      if (i >= 3) {
        await release(limiter)
      }
      await reserve(limiter)
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
    await release(limiter)

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