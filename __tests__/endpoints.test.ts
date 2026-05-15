import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import { createResponse, parseRequestBody } from '../utils/response'
import { NvidiaProvider } from '../providers/nvidia-provider'

import { ProviderConfigs, createModelsList } from '../config/providers'
import { getProviderByName, isValidProviderType, resetProviderRegistry } from '../providers/provider-factory'
import type { Env } from '../interfaces/general'


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
    it('should have nvidia endpoint configured', () => {
      expect(ProviderConfigs.nvidia).toBeDefined()
      expect(ProviderConfigs.nvidia.endpoint).toBe('/chat/completions')
    })


    it('should have claude endpoint configured', () => {
      expect(ProviderConfigs.claude).toBeDefined()
      expect(ProviderConfigs.claude.endpoint).toBe('/messages')
    })
  })

  describe('Model list endpoints', () => {
    it('should create models list for nvidia', () => {
      const list = createModelsList('nvidia')


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

  describe('NvidiaProvider', () => {
    it('should transform requests correctly', () => {
      const provider = new NvidiaProvider('key', 'https://api.test')

      const payload = {
        model: 'glm5.1',
        messages: [{ role: 'user' as const, content: 'Hello' }],
      }

      const result = provider.transformRequest(payload, ProviderConfigs.nvidia) as Record<string, unknown>


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

  describe('Provider factory (URL-based routing)', () => {
    const mockEnv: Env = {
      NVIDIA_API_KEY: 'test-key',
      NVIDIA_BASE_URL: 'https://api.nvidia.test',
      OPENROUTER_API_KEY: 'openrouter-key',
      OPENROUTER_BASE_URL: 'https://openrouter.test',
      LMSTUDIO_BASE_URL: 'http://localhost:1234/v1',
      LLAMACPP_BASE_URL: 'http://localhost:8080/v1',
      OLLAMA_BASE_URL: 'http://localhost:11434/v1',
      ANALYTICS: {} as any,
      PROCESSOR: {} as any,
    }

    beforeEach(() => {
      resetProviderRegistry()
    })

    afterEach(() => {
      resetProviderRegistry()
    })

    it('should validate valid provider names', () => {
      expect(isValidProviderType('nvidia')).toBe(true)
      expect(isValidProviderType('openrouter')).toBe(true)
      expect(isValidProviderType('lmstudio')).toBe(true)
      expect(isValidProviderType('llamacpp')).toBe(true)
      expect(isValidProviderType('ollama')).toBe(true)
    })

    it('should reject invalid provider names', () => {
      expect(isValidProviderType('invalid')).toBe(false)
      expect(isValidProviderType('')).toBe(false)
      expect(isValidProviderType('nvidia-openrouter')).toBe(false)
    })

    it('should get provider by name for nvidia', () => {
      const provider = getProviderByName(mockEnv, 'nvidia')
      expect(provider.name).toBe('nvidia')
    })

    it('should get provider by name for openrouter', () => {
      const provider = getProviderByName(mockEnv, 'openrouter')
      expect(provider.name).toBe('openrouter')
    })

    it('should throw for unknown provider names', () => {
      expect(() => getProviderByName(mockEnv, 'unknown')).toThrow('Unknown provider type: unknown')
    })
  })
})

