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

vi.mock('../../providers/base-provider', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../providers/base-provider')>()
  return {
    ...mod,
    sleep: vi.fn().mockResolvedValue(undefined),
  }
})

import { NvidiaProvider } from '../../providers/nvidia-provider'
import { sleep } from '../../providers/base-provider'
import { ProviderError } from '../../errors/provider-error'

describe('NvidiaProvider - retry logic', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.mocked(sleep).mockClear()
  })

  it('should propagate 429 with local rate-limit headers when upstream omits Retry-After', async () => {
    const provider = new NvidiaProvider('test-key', 'https://api.nvidia.com/v1')

    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: 'rate limited' }), { status: 429, headers: {
          'Retry-After': '600',
        } })
      )
    ) as any

    try {
      await provider.makeRequest('/chat/completions', { model: 'test-model' }, 'openai')
      throw new Error('Expected request to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderError)
      const providerError = error as ProviderError
      expect(providerError.status).toBe(429)
      const retryAfter = providerError.responseHeaders?.['Retry-After'] ?? 'unknown'
      expect(retryAfter).toBe('600')
      expect(providerError.responseHeaders).toMatchObject({
        'Retry-After': '600',
        'RateLimit-Reset': expect.any(String),
        'X-RateLimit-Limit': '25',
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': expect.any(String),
        'X-RateLimit-Delay-Ms': '600000',
      })
    }

    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()

    globalThis.fetch = originalFetch
  })

  it('should respect upstream Retry-After header on propagated 429', async () => {
    const provider = new NvidiaProvider('test-key', 'https://api.nvidia.com/v1')

    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: 'rate limited' }), {
          status: 429,
          headers: { 'Retry-After': '120' },
        })
      )
    ) as any

    try {
      await provider.makeRequest('/chat/completions', { model: 'test-model' }, 'openai')
      throw new Error('Expected request to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderError)
      const providerError = error as ProviderError
      const retryAfter = providerError.responseHeaders?.['Retry-After'] ?? 'unknown'
      expect(retryAfter).toBe('120')
      expect(providerError.responseHeaders).toMatchObject({
        'Retry-After': '120',
        'X-RateLimit-Delay-Ms': '120000',
      })
    }

    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()

    globalThis.fetch = originalFetch
  })

  it('should fall back to standard retry delay for 502/503 retries', async () => {
    const provider = new NvidiaProvider('test-key', 'https://api.nvidia.com/v1')

    vi.spyOn(Math, 'random').mockReturnValue(0)

    let attempt = 0
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockImplementation(() => {
      attempt++
      if (attempt === 1) {
        return Promise.resolve(
          new Response(JSON.stringify({ error: 'bad gateway' }), { status: 502 })
        )
      }
      if (attempt === 2) {
        return Promise.resolve(
          new Response(JSON.stringify({ error: 'service unavailable' }), { status: 503 })
        )
      }
      return Promise.resolve(
        new Response(JSON.stringify({ id: 'chatcmpl-123', choices: [{ message: { content: 'ok' } }] }), { status: 200 })
      )
    }) as any

    await provider.makeRequest('/chat/completions', { model: 'test-model' }, 'openai')

    expect(sleep).toHaveBeenNthCalledWith(1, 5000)
    expect(sleep).toHaveBeenNthCalledWith(2, 10000)

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
        new Response(JSON.stringify({ id: 'chatcmpl-123', choices: [{ message: { content: 'ok' } }] }), { status: 200 })
      )
    }) as any

    const result = await provider.makeRequest('/chat/completions', { model: 'test-model' }, 'openai')

    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
    expect(result).toEqual({ id: 'chatcmpl-123', choices: [{ message: { content: 'ok' } }] })

    globalThis.fetch = originalFetch
  })

  it('should retry on 400 and 408 errors', async () => {
    const provider = new NvidiaProvider('test-key', 'https://api.nvidia.com/v1')

    let attempt = 0
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockImplementation(() => {
      attempt++
      if (attempt === 1) {
        return Promise.resolve(
          new Response(JSON.stringify({ error: 'bad request' }), { status: 400 })
        )
      }
      if (attempt === 2) {
        return Promise.resolve(
          new Response(JSON.stringify({ error: 'timeout' }), { status: 408 })
        )
      }
      return Promise.resolve(
        new Response(JSON.stringify({ id: 'chatcmpl-123', choices: [{ message: { content: 'ok' } }] }), { status: 200 })
      )
    }) as any

    const result = await provider.makeRequest('/chat/completions', { model: 'test-model' }, 'openai')

    expect(globalThis.fetch).toHaveBeenCalledTimes(3)
    expect(result).toEqual({ id: 'chatcmpl-123', choices: [{ message: { content: 'ok' } }] })

    globalThis.fetch = originalFetch
  })

  it('should not retry on non-retryable 4xx errors', async () => {
    const provider = new NvidiaProvider('test-key', 'https://api.nvidia.com/v1')

    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
      )
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
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: 'service unavailable' }), { status: 503 })
      )
    ) as any

    await expect(
      provider.makeRequest('/chat/completions', { model: 'test-model' }, 'openai')
    ).rejects.toThrow()

    expect(globalThis.fetch).toHaveBeenCalledTimes(5)

    globalThis.fetch = originalFetch
  })
})

describe('NvidiaProvider - empty response validation', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('should throw on 200 with missing choices', async () => {
    const provider = new NvidiaProvider('test-key', 'https://api.nvidia.com/v1')
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: 'x', choices: [] }), { status: 200 })
      )
    ) as any

    await expect(
      provider.makeRequest('/chat/completions', { model: 'test-model' }, 'openai')
    ).rejects.toThrow('NVIDIA returned a response with no choices')

    globalThis.fetch = originalFetch
  })

  it('should throw on 200 with null content', async () => {
    const provider = new NvidiaProvider('test-key', 'https://api.nvidia.com/v1')
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: 'x', choices: [{ message: { content: null } }] }), { status: 200 })
      )
    ) as any

    await expect(
      provider.makeRequest('/chat/completions', { model: 'test-model' }, 'openai')
    ).rejects.toThrow('NVIDIA returned a response with empty content')

    globalThis.fetch = originalFetch
  })

  it('should throw on 200 with empty string content', async () => {
    const provider = new NvidiaProvider('test-key', 'https://api.nvidia.com/v1')
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: 'x', choices: [{ message: { content: '' } }] }), { status: 200 })
      )
    ) as any

    await expect(
      provider.makeRequest('/chat/completions', { model: 'test-model' }, 'openai')
    ).rejects.toThrow('NVIDIA returned a response with empty content')

    globalThis.fetch = originalFetch
  })
})

describe('NvidiaProvider - leaked reasoning detection', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('should throw on leaked <thinking prefix', async () => {
    const provider = new NvidiaProvider('test-key', 'https://api.nvidia.com/v1')
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: 'x', choices: [{ message: { content: '<thinking>reasoning here' } }] }), { status: 200 })
      )
    ) as any

    await expect(
      provider.makeRequest('/chat/completions', { model: 'test-model' }, 'openai')
    ).rejects.toThrow('NVIDIA returned response with leaked reasoning tokens')

    globalThis.fetch = originalFetch
  })

  it('should throw on leaked <reasoning prefix', async () => {
    const provider = new NvidiaProvider('test-key', 'https://api.nvidia.com/v1')
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: 'x', choices: [{ message: { content: '<reasoning>reasoning here' } }] }), { status: 200 })
      )
    ) as any

    await expect(
      provider.makeRequest('/chat/completions', { model: 'test-model' }, 'openai')
    ).rejects.toThrow('NVIDIA returned response with leaked reasoning tokens')

    globalThis.fetch = originalFetch
  })

  it('should not throw on normal content', async () => {
    const provider = new NvidiaProvider('test-key', 'https://api.nvidia.com/v1')
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: 'x', choices: [{ message: { content: 'Hello world' } }] }), { status: 200 })
      )
    ) as any

    const result = await provider.makeRequest('/chat/completions', { model: 'test-model' }, 'openai')
    expect(result).toEqual({ id: 'x', choices: [{ message: { content: 'Hello world' } }] })

    globalThis.fetch = originalFetch
  })
})

describe('NvidiaProvider - payload sanitization', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('should strip unstable parameters from payload', async () => {
    const provider = new NvidiaProvider('test-key', 'https://api.nvidia.com/v1')
    const originalFetch = globalThis.fetch
    let capturedBody: string | null = null

    globalThis.fetch = vi.fn().mockImplementation((_url, init) => {
      if (typeof init === 'object' && init !== null) {
        capturedBody = (init as RequestInit).body as string | null
      }
      return Promise.resolve(
        new Response(JSON.stringify({ id: 'x', choices: [{ message: { content: 'ok' } }] }), { status: 200 })
      )
    }) as any

    await provider.makeRequest('/chat/completions', {
      model: 'test-model',
      messages: [],
      frequency_penalty: 0.5,
      presence_penalty: 0.3,
      logprobs: true,
      top_logprobs: 5,
      seed: 42,
    }, 'openai')

    expect(capturedBody).toBeDefined()
    const parsed = JSON.parse(capturedBody!)
    expect(parsed).not.toHaveProperty('frequency_penalty')
    expect(parsed).not.toHaveProperty('presence_penalty')
    expect(parsed).not.toHaveProperty('logprobs')
    expect(parsed).not.toHaveProperty('top_logprobs')
    expect(parsed).not.toHaveProperty('seed')
    expect(parsed).toHaveProperty('model', 'test-model')

    globalThis.fetch = originalFetch
  })
})

describe('NvidiaProvider - network error retry', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('should retry on fetch TypeError and succeed', async () => {
    const provider = new NvidiaProvider('test-key', 'https://api.nvidia.com/v1')

    let attempt = 0
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockImplementation(() => {
      attempt++
      if (attempt === 1) {
        return Promise.reject(new TypeError('Failed to fetch'))
      }
      return Promise.resolve(
        new Response(JSON.stringify({ id: 'chatcmpl-123', choices: [{ message: { content: 'ok' } }] }), { status: 200 })
      )
    }) as any

    const result = await provider.makeRequest('/chat/completions', { model: 'test-model' }, 'openai')

    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
    expect(result).toEqual({ id: 'chatcmpl-123', choices: [{ message: { content: 'ok' } }] })

    globalThis.fetch = originalFetch
  })

  it('should retry on "Network connection lost" error and succeed', async () => {
    const provider = new NvidiaProvider('test-key', 'https://api.nvidia.com/v1')

    let attempt = 0
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockImplementation(() => {
      attempt++
      if (attempt <= 2) {
        return Promise.reject(new Error('Network connection lost'))
      }
      return Promise.resolve(
        new Response(JSON.stringify({ id: 'chatcmpl-123', choices: [{ message: { content: 'ok' } }] }), { status: 200 })
      )
    }) as any

    const result = await provider.makeRequest('/chat/completions', { model: 'test-model' }, 'openai')

    expect(globalThis.fetch).toHaveBeenCalledTimes(3)
    expect(result).toEqual({ id: 'chatcmpl-123', choices: [{ message: { content: 'ok' } }] })

    globalThis.fetch = originalFetch
  })

  it('should retry up to max attempts on network errors then throw', async () => {
    const provider = new NvidiaProvider('test-key', 'https://api.nvidia.com/v1')

    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.reject(new TypeError('Network connection lost'))
    ) as any

    await expect(
      provider.makeRequest('/chat/completions', { model: 'test-model' }, 'openai')
    ).rejects.toThrow()

    expect(globalThis.fetch).toHaveBeenCalledTimes(5)

    globalThis.fetch = originalFetch
  })
})
