import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../utils/logger', () => ({
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

vi.mock('../providers/base-provider', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../providers/base-provider')>()
  return {
    ...mod,
    sleep: vi.fn().mockResolvedValue(undefined),
  }
})

import { NvidiaProvider } from '../providers/nvidia-provider'

import { ProviderConfigs } from '../config/providers'
import { ProviderError } from '../errors/provider-error'

describe('NvidiaProvider', () => {
  let provider: NvidiaProvider

  beforeEach(() => {
    provider = new NvidiaProvider('test-api-key', 'https://api.nvidia.test')

  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('transformRequest', () => {
    it('should transform payload with string content', () => {
      const config = ProviderConfigs.nvidia
      const payload = {
        model: 'nvidia/z-ai/glm-5.1',
        content: 'Simple prompt',
      }

      const result = provider.transformRequest(payload, config) as Record<string, unknown>

      expect(result.messages).toEqual([{ role: 'user', content: 'Simple prompt' }])
    })

    it('should transform payload with content array (MessageContentPart)', () => {
      const config = ProviderConfigs.nvidia
      const payload = {
        model: 'nvidia/z-ai/glm-5.1',
        content: [{ type: 'text' as const, text: 'Hello with parts' }],
      }

      const result = provider.transformRequest(payload, config) as Record<string, unknown>

      expect(result.messages).toEqual([{ role: 'user', content: [{ type: 'text', text: 'Hello with parts' }] }])
    })

    it('should override defaults with payload values', () => {
      const config = ProviderConfigs.nvidia
      const payload = {
        model: 'nvidia/z-ai/glm-5.1',
        messages: [{ role: 'user' as const, content: 'Hello' }],
        temperature: 0.5,
        max_tokens: 100,
        stream: true,
      }

      const result = provider.transformRequest(payload, config) as Record<string, unknown>

      expect(result.temperature).toBe(0.5)
      expect(result.max_tokens).toBe(100)
      expect(result.stream).toBe(true)
    })

    it('should forward extra provider-specific params', () => {
      const config = ProviderConfigs.nvidia
      const payload = {
        model: 'nvidia/z-ai/glm-5.1',
        messages: [{ role: 'user' as const, content: 'Hello' }],
        tools: [{ name: 'calculator' }],
        response_format: { type: 'json_object' },
      }

      const result = provider.transformRequest(payload, config) as Record<string, unknown>

      expect(result.tools).toEqual([{ name: 'calculator' }])
      expect(result.response_format).toEqual({ type: 'json_object' })
    })

    it('should not forward routing keys as extra params', () => {
      const config = ProviderConfigs.nvidia
      const payload = {
        provider: 'openai',
        model: 'nvidia/z-ai/glm-5.1',
        messages: [{ role: 'user' as const, content: 'Hello' }],
        content: 'should be ignored',
      }

      const result = provider.transformRequest(payload, config) as Record<string, unknown>

      // provider, model, messages, content should not be in commonPayload as extra
      expect(result.provider).toBeUndefined()
      expect(result.content).toBeUndefined()
    })

    it('should throw ProviderError if model is missing', () => {
      const config = ProviderConfigs.nvidia
      const payload = {
        messages: [{ role: 'user' as const, content: 'Hello' }],
      }

      expect(() => provider.transformRequest(payload, config)).toThrow(ProviderError)
    })
  })

  describe('makeRequest', () => {
    it('should make a successful request and return JSON', async () => {
      const mockResponse = {
        id: 'test-id',
        choices: [{ message: { content: 'Hello' }, finish_reason: 'stop' }],
      }

      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )

      const result = await provider.makeRequest('/chat/completions', { model: 'test' }, 'openai')

      expect(result).toEqual(mockResponse)
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://api.nvidia.test/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-api-key',
          }),
        })
      )
    })

    it('should throw ProviderError on upstream error (4xx)', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Bad Request' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        })
      )

      await expect(provider.makeRequest('/chat/completions', { model: 'test' }, 'openai')).rejects.toThrow(
        ProviderError
      )
    })

    it('should throw ProviderError with retry-after on 429', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Rate limited' }), {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': '60',
          },
        })
      )

      try {
        await provider.makeRequest('/chat/completions', { model: 'test' }, 'openai')
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(ProviderError)
        const providerError = error as ProviderError
        expect(providerError.status).toBe(429)
        expect(providerError.code).toBe('upstream_rate_limited')
        const retryAfter = providerError.responseHeaders?.['Retry-After'] ?? 'unknown'
        expect(retryAfter).toBe('60')
      }
    })

    it('should throw ProviderError on network error (AbortError)', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

      try {
        await provider.makeRequest('/chat/completions', { model: 'test' }, 'openai')
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(ProviderError)
        const providerError = error as ProviderError
        expect(providerError.code).toBe('upstream_network_error')
        expect(providerError.status).toBe(502)
      }
    })

    it('should handle non-JSON error bodies', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response('Plain text error', {
          status: 500,
          headers: { 'Content-Type': 'text/plain' },
        })
      )

      try {
        await provider.makeRequest('/chat/completions', { model: 'test' }, 'openai')
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(ProviderError)
      }
    })
  })

  describe('makeStreamRequest', () => {
    it('should make a streaming request and return response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response('stream data', {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        })
      )

      const result = await provider.makeStreamRequest('/chat/completions', { model: 'test' })

      expect(result.status).toBe(200)
      expect(result.headers.get('Content-Type')).toBe('text/event-stream')
    })

    it('should throw ProviderError on upstream error in stream', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Bad Request' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        })
      )

      await expect(provider.makeStreamRequest('/chat/completions', { model: 'test' })).rejects.toThrow(
        ProviderError
      )
    })
  })
})
