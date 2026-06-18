import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { LMStudioProvider, LlamaCppProvider, OllamaProvider } from '../../providers/local-provider'
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

function captureFetch(): { fetchMock: ReturnType<typeof vi.fn>; getInit: () => RequestInit | undefined } {
  const fetchMock = vi.fn()
  let capturedInit: RequestInit | undefined
  fetchMock.mockImplementation((_url: unknown, init: RequestInit) => {
    capturedInit = init
    return Promise.resolve(mockResponse({ status: 200, body: { choices: [{ message: { content: 'ok' } }] } }))
  })
  vi.stubGlobal('fetch', fetchMock)
  return { fetchMock, getInit: () => capturedInit }
}

const PROVIDERS = [
  { name: 'lmstudio', ctor: LMStudioProvider, base: 'http://localhost:1234/v1' },
  { name: 'llamacpp', ctor: LlamaCppProvider, base: 'http://localhost:8080/v1' },
  { name: 'ollama', ctor: OllamaProvider, base: 'http://localhost:11434/v1' },
]

describe.each(PROVIDERS)('$name provider', ({ name, ctor, base }) => {
  let provider: InstanceType<typeof ctor>

  beforeEach(() => {
    provider = new ctor('', base)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('exposes the correct name', () => {
    expect(provider.name).toBe(name)
  })

  describe('makeRequest', () => {
    it('returns parsed JSON on 200', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        mockResponse({ status: 200, body: { choices: [{ message: { content: 'hi' } }] } }),
      ))

      const res = await provider.makeRequest('/chat/completions', { model: 'x' }, 'openai') as { choices: { message: { content: string } }[] }
      expect(res.choices[0].message.content).toBe('hi')
    })

    it('does not send Authorization header (local providers are keyless)', async () => {
      const { getInit } = captureFetch()
      await provider.makeRequest('/chat/completions', { model: 'x' }, 'openai')
      const init = getInit()!
      const headers = init.headers as Record<string, string>
      expect(headers['Authorization']).toBeUndefined()
      expect(headers['Content-Type']).toBe('application/json')
    })

    it('throws upstream_timeout (504) on AbortError', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(
        Object.assign(new Error('aborted'), { name: 'AbortError' }),
      ))

      await expect(
        provider.makeRequest('/chat/completions', { model: 'x' }, 'openai'),
      ).rejects.toSatisfy((err: ProviderError) => err.status === 504 && err.code === 'upstream_timeout')
    })

    it('throws upstream_network_error (502) on other fetch errors', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))

      await expect(
        provider.makeRequest('/chat/completions', { model: 'x' }, 'openai'),
      ).rejects.toSatisfy((err: ProviderError) => err.status === 502 && err.code === 'upstream_network_error')
    })

    it('throws upstream_error preserving status code on non-2xx', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        mockResponse({ status: 500, body: { error: 'boom' } }),
      ))

      await expect(
        provider.makeRequest('/chat/completions', { model: 'x' }, 'openai'),
      ).rejects.toSatisfy((err: ProviderError) => err.status === 500 && err.code === 'upstream_error')
    })

    it('throws upstream_rate_limited on 429', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        mockResponse({ status: 429, body: { error: 'rate limited' }, headers: { 'Retry-After': '5' } }),
      ))

      await expect(
        provider.makeRequest('/chat/completions', { model: 'x' }, 'openai'),
      ).rejects.toSatisfy((err: ProviderError) => err.status === 429 && err.code === 'upstream_rate_limited')
    })
  })

  describe('makeStreamRequest', () => {
    it('returns the upstream Response on 200', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        mockResponse({ status: 200, body: 'data: {}\n\n', headers: { 'content-type': 'text/event-stream' } }),
      ))

      const res = await provider.makeStreamRequest('/chat/completions', { model: 'x' })
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe('text/event-stream')
    })

    it('throws upstream_timeout (504) on AbortError', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(
        Object.assign(new Error('aborted'), { name: 'AbortError' }),
      ))

      await expect(
        provider.makeStreamRequest('/chat/completions', { model: 'x' }),
      ).rejects.toSatisfy((err: ProviderError) => err.status === 504 && err.code === 'upstream_timeout')
    })

    it('throws upstream_network_error (502) on network failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('socket hang up')))

      await expect(
        provider.makeStreamRequest('/chat/completions', { model: 'x' }),
      ).rejects.toSatisfy((err: ProviderError) => err.status === 502 && err.code === 'upstream_network_error')
    })

    it('throws upstream_error preserving status code', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        mockResponse({ status: 503, body: { error: 'unavailable' } }),
      ))

      await expect(
        provider.makeStreamRequest('/chat/completions', { model: 'x' }),
      ).rejects.toSatisfy((err: ProviderError) => err.status === 503 && err.code === 'upstream_error')
    })
  })

  it('constructs the URL from baseUrl + endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse({ status: 200, body: { choices: [{ message: { content: 'x' } }] } }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await provider.makeRequest('/v1/chat/completions', { model: 'x' }, 'openai')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const urlArg = fetchMock.mock.calls[0][0]
    expect(String(urlArg)).toBe(`${base}/v1/chat/completions`)
  })
})
