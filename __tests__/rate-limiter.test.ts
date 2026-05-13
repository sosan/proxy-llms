import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { RateLimiter } from '../server.ts'

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should allow requests within the limit', () => {
    const limiter = new RateLimiter(5, 60000)

    for (let i = 0; i < 5; i++) {
      expect(limiter.isAllowed('client-1')).toBe(true)
    }
  })

  it('should block requests that exceed the limit', () => {
    const limiter = new RateLimiter(3, 60000)

    expect(limiter.isAllowed('client-1')).toBe(true)
    expect(limiter.isAllowed('client-1')).toBe(true)
    expect(limiter.isAllowed('client-1')).toBe(true)
    expect(limiter.isAllowed('client-1')).toBe(false)
  })

  it('should reset the window after windowMs', () => {
    const limiter = new RateLimiter(2, 60000)

    expect(limiter.isAllowed('client-1')).toBe(true)
    expect(limiter.isAllowed('client-1')).toBe(true)
    expect(limiter.isAllowed('client-1')).toBe(false)

    // Advance time past the window
    vi.advanceTimersByTime(61000)

    expect(limiter.isAllowed('client-1')).toBe(true)
  })

  it('should track different clients independently', () => {
    const limiter = new RateLimiter(2, 60000)

    expect(limiter.isAllowed('client-1')).toBe(true)
    expect(limiter.isAllowed('client-1')).toBe(true)
    expect(limiter.isAllowed('client-1')).toBe(false)

    // client-2 should still be allowed
    expect(limiter.isAllowed('client-2')).toBe(true)
    expect(limiter.isAllowed('client-2')).toBe(true)
  })

  it('should use default values (40 requests, 60s window)', () => {
    const limiter = new RateLimiter()

    // Make 40 requests
    for (let i = 0; i < 40; i++) {
      expect(limiter.isAllowed('client-default')).toBe(true)
    }

    // 41st should be blocked
    expect(limiter.isAllowed('client-default')).toBe(false)
  })

  it('should clean up old requests when new ones come in', () => {
    const limiter = new RateLimiter(3, 60000)

    // Make 3 requests
    expect(limiter.isAllowed('client-1')).toBe(true)
    expect(limiter.isAllowed('client-1')).toBe(true)
    expect(limiter.isAllowed('client-1')).toBe(true)
    expect(limiter.isAllowed('client-1')).toBe(false)

    // Advance time but not past the window
    vi.advanceTimersByTime(30000)

    // Still blocked
    expect(limiter.isAllowed('client-1')).toBe(false)

    // Advance past the window
    vi.advanceTimersByTime(35000)

    // Should be allowed again
    expect(limiter.isAllowed('client-1')).toBe(true)
  })
})
