import { describe, it, expect } from 'vitest'
import { createResponse, parseRequestBody, RateLimiter, NIMProvider } from '../server.ts'
import { ProviderConfigs, createModelsList } from '../config/providers'

describe('API Endpoints', () => {
  describe('createResponse helper', () => {
    it('should create a standard API response', () => {
      const response = createResponse(true, { status: 'ok' })

      expect(response.success).toBe(true)
      expect(response.data).toEqual({ status: 'ok' })
      expect(response.error).toBeNull()
      expect(response.timestamp).toBeDefined()
    })
  })

  describe('parseRequestBody', () => {
    it('should parse valid JSON body', async () => {
      const request = new Request('https://example.com/test', {
        method: 'POST',
        body: JSON.stringify({ provider: 'openai', model: 'gpt-4' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const result = await parseRequestBody(request)

      expect(result.error).toBeUndefined()
      expect(result.payload).toBeDefined()
      expect(result.payload!.provider).toBe('openai')
    })

    it('should return error for empty body', async () => {
      const request = new Request('https://example.com/test', {
        method: 'POST',
        body: '',
        headers: { 'Content-Type': 'application/json' },
      })

      const result = await parseRequestBody(request)

      expect(result.error).toBeDefined()
      expect(result.status).toBe(400)
    })
  })

  describe('Provider route configuration', () => {
    it('should have openai endpoint configured', () => {
      expect(ProviderConfigs.openai).toBeDefined()
      expect(ProviderConfigs.openai.endpoint).toBe('/chat/completions')
    })

    it('should have claude endpoint configured', () => {
      expect(ProviderConfigs.claude).toBeDefined()
      expect(ProviderConfigs.claude.endpoint).toBe('/messages')
    })
  })

  describe('Model list endpoints', () => {
    it('should create models list for openai', () => {
      const list = createModelsList('openai')

      expect(list.object).toBe('list')
      expect(Array.isArray(list.data)).toBe(true)
      expect(list.data.length).toBeGreaterThan(0)

      const firstModel = list.data[0]
      expect(firstModel).toHaveProperty('id')
      expect(firstModel).toHaveProperty('object', 'model')
      expect(firstModel).toHaveProperty('owned_by')
    })

    it('should create models list for claude', () => {
      const list = createModelsList('claude')

      expect(list.object).toBe('list')
      expect(list.data.length).toBeGreaterThan(0)
    })
  })

  describe('Rate limiting', () => {
    it('should limit requests per client', () => {
      const limiter = new RateLimiter(2, 60000)

      expect(limiter.isAllowed('client-1')).toBe(true)
      expect(limiter.isAllowed('client-1')).toBe(true)
      expect(limiter.isAllowed('client-1')).toBe(false)
    })
  })

  describe('NIMProvider', () => {
    it('should transform requests correctly', () => {
      const provider = new NIMProvider('key', 'https://api.test')
      const payload = {
        model: 'glm5.1',
        messages: [{ role: 'user' as const, content: 'Hello' }],
      }

      const result = provider.transformRequest(payload, ProviderConfigs.openai) as Record<string, unknown>

      expect(result.model).toBe('z-ai/glm-5.1')
      expect(result.messages).toEqual([{ role: 'user', content: 'Hello' }])
    })
  })

  describe('Health endpoint response structure', () => {
    it('should match the expected health response structure', () => {
      const response = createResponse(true, {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      })

      expect(response.success).toBe(true)
      expect(response.data).toHaveProperty('status', 'healthy')
      expect(response.data).toHaveProperty('timestamp')
      expect(response.data).toHaveProperty('version', '1.0.0')
    })
  })
})
