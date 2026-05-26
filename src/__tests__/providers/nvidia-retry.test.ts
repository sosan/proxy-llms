import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../utils/logger', () => ({
  logger: {
    withEnv: vi.fn().mockReturnValue({
      info: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      logUpstreamConfig: vi.fn(),
    }),
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    logUpstreamConfig: vi.fn(),
  },
}))

import { NvidiaProvider } from '../../providers/nvidia-provider'

describe('NvidiaProvider - retry logic', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('should retry on 429 rate limit error and succeed on second attempt', async () => {
    const provider = new NvidiaProvider('test-key', 'https://api.nvidia.com/v1')

    let attempt = 0
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockImplementation(() => {
      attempt++
      if (attempt === 1) {
        return Promise.resolve(
          new Response(JSON.stringify({ error: 'rate limited' }), { status: 429 })
        )
      }
      return Promise.resolve(
        new Response(JSON.stringify({ id: 'chatcmpl-123', choices: [] }), { status: 200 })
      )
    }) as any

    const result = await provider.makeRequest('/chat/completions', { model: 'test-model' }, 'openai')

    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
    expect(result).toEqual({ id: 'chatcmpl-123', choices: [] })

    globalThis.fetch = originalFetch
  })

  it('should retry on 502/503/504 errors', async () => {
    const provider = new NvidiaProvider('test-key', 'https://api.nvidia.com/v1')

    let attempt = 0
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockImplementation(() => {
      attempt++
      if (attempt === 1) {
        return Promise.resolve(
          new Response(JSON.stringify({ error: 'bad gateway' }), { status: 502 })
        )
      }
      return Promise.resolve(
        new Response(JSON.stringify({ id: 'chatcmpl-123', choices: [] }), { status: 200 })
      )
    }) as any

    const result = await provider.makeRequest('/chat/completions', { model: 'test-model' }, 'openai')

    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
    expect(result).toEqual({ id: 'chatcmpl-123', choices: [] })

    globalThis.fetch = originalFetch
  })

  it('should not retry on 4xx errors other than 429', async () => {
    const provider = new NvidiaProvider('test-key', 'https://api.nvidia.com/v1')

    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'bad request' }), { status: 400 })
    ) as any

    await expect(
      provider.makeRequest('/chat/completions', { model: 'test-model' }, 'openai')
    ).rejects.toThrow()

    expect(globalThis.fetch).toHaveBeenCalledTimes(1)

    globalThis.fetch = originalFetch
  })

  it('should retry up to max attempts and then throw', async () => {
    const provider = new NvidiaProvider('test-key', 'https://api.nvidia.com/v1')

    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'rate limited' }), { status: 429 })
    ) as any

    await expect(
      provider.makeRequest('/chat/completions', { model: 'test-model' }, 'openai')
    ).rejects.toThrow()

    expect(globalThis.fetch).toHaveBeenCalledTimes(3) // RETRY_MAX_ATTEMPTS

    globalThis.fetch = originalFetch
  })
})
