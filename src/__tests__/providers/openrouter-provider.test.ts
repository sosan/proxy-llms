import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { OpenRouterProvider } from '../../providers/openrouter-provider'
import { ProviderError } from '../../errors/provider-error'
import { ProviderConfigs } from '../../config/providers'
import { RETRY_MAX_ATTEMPTS } from '../../providers/base-provider'

vi.mock('../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    logUpstreamConfig: vi.fn(),
  },
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

  describe('transformRequest', () => {
    it('forwards the OpenRouter reasoning map for hy3 and drops chat_template_kwargs', () => {
      const result = makeProvider().transformRequest(
        { model: 'openrouter/tencent/hy3:free', messages: [{ role: 'user', content: 'hi' }] },
        ProviderConfigs.openrouter,
      ) as Record<string, unknown>

      expect(result.model).toBe('tencent/hy3:free')
      expect(result.reasoning).toEqual({ enabled: true, exclude: false })
      expect(result.chat_template_kwargs).toBeUndefined()
    })

    it('applies OpenRouter documented defaults (temperature 0.9, top_p 1)', () => {
      const result = makeProvider().transformRequest(
        { model: 'openrouter/tencent/hy3:free', messages: [{ role: 'user', content: 'hi' }] },
        ProviderConfigs.openrouter,
      ) as Record<string, unknown>

      expect(result.temperature).toBe(0.9)
      expect(result.top_p).toBe(1)
      expect(result.max_tokens).toBe(5834)
      expect(result.stream).toBe(true)
    })

    it('lets payload override defaults', () => {
      const result = makeProvider().transformRequest(
        {
          model: 'openrouter/tencent/hy3:free',
          messages: [{ role: 'user', content: 'hi' }],
          temperature: 0.5,
          top_p: 0.8,
          max_tokens: 100,
          stream: false,
        },
        ProviderConfigs.openrouter,
      ) as Record<string, unknown>

      expect(result.temperature).toBe(0.5)
      expect(result.top_p).toBe(0.8)
      expect(result.max_tokens).toBe(100)
      expect(result.stream).toBe(false)
    })

    it('caps max_tokens at maxTokensCap', () => {
      const result = makeProvider().transformRequest(
        {
          model: 'openrouter/tencent/hy3:free',
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 999999,
        },
        ProviderConfigs.openrouter,
      ) as Record<string, unknown>

      expect(result.max_tokens).toBe(5834)
    })

    it('forwards passthrough fields and overrides reasoning from payload', () => {
      const result = makeProvider().transformRequest(
        {
          model: 'openrouter/tencent/hy3:free',
          messages: [{ role: 'user', content: 'hi' }],
          tools: [{ name: 'calculator' }],
          response_format: { type: 'json_object' },
          stop: ['\n'],
          reasoning: { enabled: false },
        },
        ProviderConfigs.openrouter,
      ) as Record<string, unknown>

      expect(result.tools).toEqual([{ name: 'calculator' }])
      expect(result.response_format).toEqual({ type: 'json_object' })
      expect(result.stop).toEqual(['\n'])
      expect(result.reasoning).toEqual({ enabled: false })
    })

    it('strips routing keys (provider, content)', () => {
      const result = makeProvider().transformRequest(
        {
          provider: 'openrouter',
          model: 'openrouter/tencent/hy3:free',
          content: 'should be ignored',
          messages: [{ role: 'user', content: 'hi' }],
        },
        ProviderConfigs.openrouter,
      ) as Record<string, unknown>

      expect(result.provider).toBeUndefined()
      expect(result.content).toBeUndefined()
    })

    it('throws ProviderError when model is missing', () => {
      expect(() =>
        makeProvider().transformRequest(
          { messages: [{ role: 'user', content: 'hi' }] },
          ProviderConfigs.openrouter,
        ),
      ).toThrow(ProviderError)
    })
  })

  describe('retry', () => {
    it('retries a 502 response up to RETRY_MAX_ATTEMPTS then throws upstream_error', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        mockResponse({ status: 502, body: { error: 'bad gateway' } }),
      )
      vi.stubGlobal('fetch', fetchMock)

      await expect(
        makeProvider().makeRequest('/chat/completions', { model: 'x' }, 'openai'),
      ).rejects.toSatisfy((err: ProviderError) => err.status === 502 && err.code === 'upstream_error')

      expect(fetchMock).toHaveBeenCalledTimes(RETRY_MAX_ATTEMPTS)
    })

    it('retries a 504 response up to RETRY_MAX_ATTEMPTS then throws upstream_error', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        mockResponse({ status: 504, body: { error: 'gateway timeout' } }),
      )
      vi.stubGlobal('fetch', fetchMock)

      await expect(
        makeProvider().makeRequest('/chat/completions', { model: 'x' }, 'openai'),
      ).rejects.toSatisfy((err: ProviderError) => err.status === 504 && err.code === 'upstream_error')

      expect(fetchMock).toHaveBeenCalledTimes(RETRY_MAX_ATTEMPTS)
    })

    it('does not retry a 401 (single fetch call)', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        mockResponse({ status: 401, body: { error: 'unauthorized' } }),
      )
      vi.stubGlobal('fetch', fetchMock)

      await expect(
        makeProvider().makeRequest('/chat/completions', { model: 'x' }, 'openai'),
      ).rejects.toSatisfy((err: ProviderError) => err.status === 401 && err.code === 'upstream_error')

      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('does not retry a 429 and enriches rate-limit headers', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        mockResponse({ status: 429, body: { error: 'limited' }, headers: { 'Retry-After': '10' } }),
      )
      vi.stubGlobal('fetch', fetchMock)

      await expect(
        makeProvider().makeRequest('/chat/completions', { model: 'x' }, 'openai'),
      ).rejects.toSatisfy((err: ProviderError) => {
        const h = err.responseHeaders ?? {}
        return err.status === 429
          && err.code === 'upstream_rate_limited'
          && h['Retry-After'] === '10'
          && h['X-RateLimit-Remaining'] === '0'
          && h['X-RateLimit-Delay-Ms'] === '10000'
          && typeof h['RateLimit-Reset'] === 'string'
          && typeof h['X-RateLimit-Reset'] === 'string'
          && h['X-RateLimit-Limit'] === undefined
      })

      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('retries a 502 stream response up to RETRY_MAX_ATTEMPTS', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        mockResponse({ status: 502, body: { error: 'bad gateway' } }),
      )
      vi.stubGlobal('fetch', fetchMock)

      await expect(
        makeProvider().makeStreamRequest('/chat/completions', { model: 'x' }),
      ).rejects.toSatisfy((err: ProviderError) => err.status === 502 && err.code === 'upstream_error')

      expect(fetchMock).toHaveBeenCalledTimes(RETRY_MAX_ATTEMPTS)
    })
  })
})
