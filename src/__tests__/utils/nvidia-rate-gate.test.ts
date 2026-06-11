import { describe, it, expect, vi, beforeEach } from 'vitest'
import { waitForNvidiaRateLimit } from '../../utils/nvidia-rate-gate'
import { ProviderError } from '../../errors/provider-error'

describe('waitForNvidiaRateLimit', () => {
  let mockFetch: ReturnType<typeof vi.fn>
  let mockEnv: any

  beforeEach(() => {
    mockFetch = vi.fn()
    mockEnv = {
      NVIDIA_API_KEY: 'test-api-key',
      NVIDIA_RATE_LIMITER: {
        getByName: () => ({ fetch: mockFetch })
      }
    }
    vi.useFakeTimers()
  })

  it('should pass through without delay when delayMs is 0', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      headers: new Headers(),
      json: async () => ({ allowed: true, delayMs: 0 })
    })

    const promise = waitForNvidiaRateLimit(mockEnv)
    await vi.runAllTimersAsync()
    await expect(promise).resolves.toBeUndefined()
  })

  it('should throw ProviderError when response is not ok', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      headers: new Headers(),
      json: async () => ({})
    })

    await expect(waitForNvidiaRateLimit(mockEnv)).rejects.toThrow(ProviderError)
    await expect(waitForNvidiaRateLimit(mockEnv)).rejects.toThrow('NVIDIA rate gate queue is full')
  })

  it('should throw ProviderError when allowed is false', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      headers: new Headers(),
      json: async () => ({ allowed: false, delayMs: 70000 })
    })

    await expect(waitForNvidiaRateLimit(mockEnv)).rejects.toThrow(ProviderError)
    await expect(waitForNvidiaRateLimit(mockEnv)).rejects.toThrow('NVIDIA rate gate queue is full')
  })

  it('should handle missing json gracefully', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      headers: new Headers(),
      json: async () => { throw new Error('parse error') }
    })

    await expect(waitForNvidiaRateLimit(mockEnv)).rejects.toThrow(ProviderError)
  })
})
