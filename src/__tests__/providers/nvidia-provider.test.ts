import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NvidiaProvider } from '../../providers/nvidia-provider'
import { ProviderError } from '../../errors/provider-error'
import { logger } from '../../utils/logger'

vi.mock('../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    logUpstreamConfig: vi.fn(),
  },
}))

vi.mock('../../utils/nvidia-rate-gate', () => ({
  hashNvidiaApiKey: vi.fn().mockResolvedValue('hashed-key'),
  throwRateLimited: vi.fn((lock, headers) => {
    const err = new ProviderError(
      'Rate limited',
      429,
      'rate_limited',
      'Rate limit exceeded',
    )
    err.responseHeaders = headers instanceof Headers
      ? Object.fromEntries(headers.entries())
      : (headers as Record<string, string>) || {}
    throw err
  }),
  wait: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../providers/base-provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../providers/base-provider')>()
  return {
    ...actual,
    sleep: vi.fn().mockResolvedValue(undefined),
  }
})

function mockResponse(opts: {
  status?: number
  body?: unknown
  headers?: Record<string, string>
}): Response {
  const { status = 200, body, headers = {} } = opts
  const blob = typeof body === 'string' ? body : JSON.stringify(body)
  return new Response(blob, { status, headers })
}

function makeProvider(rateLimiter?: unknown) {
  return new NvidiaProvider(
    'test-api-key',
    'https://api.nvidia.test',
    rateLimiter as any,
  )
}

describe('NvidiaProvider', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('makeStreamRequest', () => {
    it('returns upstream response on success', async () => {
      const provider = makeProvider()
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        mockResponse({ status: 200, body: 'data: {}\n\n', headers: { 'content-type': 'text/event-stream' } }),
      ))

      const res = await provider.makeStreamRequest('/v1/chat/completions', {
        model: 'nvidia-test',
        messages: [{ role: 'user', content: 'hi' }],
      })

      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe('text/event-stream')
      expect(fetch).toHaveBeenCalledTimes(1)
    })

    it('throws ProviderError on timeout (AbortError)', async () => {
      const provider = makeProvider()
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(
        Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }),
      ))

      await expect(
        provider.makeStreamRequest('/v1/chat/completions', { model: 'nvidia-test' }),
      ).rejects.toThrow('NVIDIA did not send a response before the proxy timeout')
    })

    it('throws ProviderError on network error', async () => {
      const provider = makeProvider()
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))

      await expect(
        provider.makeStreamRequest('/v1/chat/completions', { model: 'nvidia-test' }),
      ).rejects.toThrow('Network error while contacting NVIDIA')
    })

    it('throws with rate-limit headers on 429', async () => {
      const provider = makeProvider()
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        mockResponse({ status: 429, body: { error: 'too many requests' }, headers: { 'Retry-After': '120' } }),
      ))

      await expect(
        provider.makeStreamRequest('/v1/chat/completions', { model: 'nvidia-test' }),
      ).rejects.toSatisfy((err: ProviderError) => {
        return err.status === 429 && err.responseHeaders?.['Retry-After'] === '120'
      })
    })
  })

  describe('makeRequest', () => {
    it('returns parsed JSON on success', async () => {
      const provider = makeProvider()
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        mockResponse({ status: 200, body: { choices: [{ message: { content: 'Hello' }, finish_reason: 'stop' }] } }),
      ))

      const res = await provider.makeRequest('/v1/chat/completions', { model: 'x' }, 'openai') as any
      expect(res.choices[0].message.content).toBe('Hello')
    })
  })

  describe('rate limiter cooldown', () => {
    it('warns when rate limiter is not configured', async () => {
      const provider = makeProvider()
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        mockResponse({ status: 200, body: { choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] } }),
      ))

      await provider.makeRequest('/v1/chat/completions', { model: 'x' }, 'openai')
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('NVIDIA rate limiter not configured'),
      )
    })

    it('throws rate-limited when reservation is denied', async () => {
      const limiterFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ allowed: false }), { status: 429 }),
      )
      const rateLimiter = {
        getByName: vi.fn().mockReturnValue({ fetch: limiterFetch }),
      }
      const provider = makeProvider(rateLimiter)
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        mockResponse({ status: 200, body: {} }),
      ))

      await expect(
        provider.makeRequest('/v1/chat/completions', { model: 'x' }, 'openai'),
      ).rejects.toThrow('Rate limited')
    })
  })
})
