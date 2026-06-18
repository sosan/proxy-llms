import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { OpenRouterProvider } from '../../providers/openrouter-provider'
import { ProviderError } from '../../errors/provider-error'

vi.mock('../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    logUpstreamConfig: vi.fn(),
  },
}))

function mockResponse(opts: {
  status?: number
  body?: unknown
  headers?: Record<string, string>
}): Response {
  const { status = 200, body, headers = {} } = opts
  const blob = typeof body === 'string' ? body : JSON.stringify(body)
  return new Response(blob, { status, headers })
}

function makeProvider(): OpenRouterProvider {
  return new OpenRouterProvider('test-key', 'https://openrouter.test/api/v1')
}

describe('OpenRouterProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('exposes the name "openrouter"', () => {
    expect(makeProvider().name).toBe('openrouter')
  })

  describe('makeRequest', () => {
    it('returns parsed JSON on 200', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        mockResponse({ status: 200, body: { choices: [{ message: { content: 'hi' } }] } }),
      ))

      const res = await makeProvider().makeRequest('/chat/completions', { model: 'x' }, 'openai') as { choices: { message: { content: string } }[] }
      expect(res.choices[0].message.content).toBe('hi')
    })

    it('sends Authorization, HTTP-Referer, X-Title, anthropic-version headers', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        mockResponse({ status: 200, body: { choices: [{ message: { content: 'ok' } }] } }),
      )
      vi.stubGlobal('fetch', fetchMock)

      await makeProvider().makeRequest('/chat/completions', { model: 'x' }, 'openai')

      const init = fetchMock.mock.calls[0][1] as RequestInit
      const headers = init.headers as Record<string, string>
      expect(headers['Authorization']).toBe('Bearer test-key')
      expect(headers['HTTP-Referer']).toBe('https://proxy-llms.local')
      expect(headers['X-Title']).toBe('Proxy LLMs')
      expect(headers['anthropic-version']).toBe('2023-06-01')
      expect(headers['Content-Type']).toBe('application/json')
    })

    it('throws upstream_timeout (504) on AbortError', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(
        Object.assign(new Error('aborted'), { name: 'AbortError' }),
      ))

      await expect(
        makeProvider().makeRequest('/chat/completions', { model: 'x' }, 'openai'),
      ).rejects.toSatisfy((err: ProviderError) => err.status === 504 && err.code === 'upstream_timeout')
    })

    it('throws upstream_network_error (502) on fetch failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')))

      await expect(
        makeProvider().makeRequest('/chat/completions', { model: 'x' }, 'openai'),
      ).rejects.toSatisfy((err: ProviderError) => err.status === 502 && err.code === 'upstream_network_error')
    })

    it('throws upstream_rate_limited with Retry-After on 429', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        mockResponse({ status: 429, body: { error: 'too many' }, headers: { 'Retry-After': '30' } }),
      ))

      await expect(
        makeProvider().makeRequest('/chat/completions', { model: 'x' }, 'openai'),
      ).rejects.toSatisfy((err: ProviderError) =>
        err.status === 429
        && err.code === 'upstream_rate_limited'
        && err.responseHeaders?.['Retry-After'] === '30'
      )
    })

    it('throws upstream_error preserving status on non-2xx non-429', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        mockResponse({ status: 502, body: { error: 'bad gateway' } }),
      ))

      await expect(
        makeProvider().makeRequest('/chat/completions', { model: 'x' }, 'openai'),
      ).rejects.toSatisfy((err: ProviderError) => err.status === 502 && err.code === 'upstream_error')
    })
  })

  describe('makeStreamRequest', () => {
    it('returns the upstream Response on 200', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        mockResponse({ status: 200, body: 'data: {}\n\n', headers: { 'content-type': 'text/event-stream' } }),
      ))

      const res = await makeProvider().makeStreamRequest('/chat/completions', { model: 'x' })
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe('text/event-stream')
    })

    it('sends auth headers on stream too', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        mockResponse({ status: 200, body: 'data: {}\n\n' }),
      )
      vi.stubGlobal('fetch', fetchMock)

      await makeProvider().makeStreamRequest('/chat/completions', { model: 'x' })

      const init = fetchMock.mock.calls[0][1] as RequestInit
      const headers = init.headers as Record<string, string>
      expect(headers['Authorization']).toBe('Bearer test-key')
      expect(headers['anthropic-version']).toBe('2023-06-01')
    })

    it('throws upstream_timeout (504) on AbortError', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(
        Object.assign(new Error('aborted'), { name: 'AbortError' }),
      ))

      await expect(
        makeProvider().makeStreamRequest('/chat/completions', { model: 'x' }),
      ).rejects.toSatisfy((err: ProviderError) => err.status === 504)
    })

    it('throws upstream_network_error (502) on network failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed')))

      await expect(
        makeProvider().makeStreamRequest('/chat/completions', { model: 'x' }),
      ).rejects.toSatisfy((err: ProviderError) => err.status === 502)
    })

    it('throws upstream_rate_limited on 429', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        mockResponse({ status: 429, body: { error: 'limited' }, headers: { 'Retry-After': '10' } }),
      ))

      await expect(
        makeProvider().makeStreamRequest('/chat/completions', { model: 'x' }),
      ).rejects.toSatisfy((err: ProviderError) => err.status === 429 && err.code === 'upstream_rate_limited')
    })

    it('throws upstream_error on 4xx', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        mockResponse({ status: 401, body: { error: 'unauthorized' } }),
      ))

      await expect(
        makeProvider().makeStreamRequest('/chat/completions', { model: 'x' }),
      ).rejects.toSatisfy((err: ProviderError) => err.status === 401 && err.code === 'upstream_error')
    })
  })
})
