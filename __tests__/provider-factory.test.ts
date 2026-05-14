import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getProviderByName, isValidProviderType, resetProviderRegistry } from '../providers/provider-factory'
import type { Env } from '../interfaces/general'

describe('Provider Factory', () => {
  let mockEnv: Env

  beforeEach(() => {
    resetProviderRegistry()
    mockEnv = {
      NVIDIA_API_KEY: 'nvidia-test-key',
      NVIDIA_BASE_URL: 'https://api.nvidia.test',
      OPENROUTER_API_KEY: 'openrouter-test-key',
      OPENROUTER_BASE_URL: 'https://openrouter.test',
      LMSTUDIO_BASE_URL: 'http://localhost:1234/v1',
      LLAMACPP_BASE_URL: 'http://localhost:8080/v1',
      OLLAMA_BASE_URL: 'http://localhost:11434/v1',
      PROCESSOR: {} as any,
      ANALYTICS: {
        writeDataPoint: () => Promise.resolve(),
      } as any,
    }
  })

  afterEach(() => {
    resetProviderRegistry()
  })

  describe('isValidProviderType', () => {
    it('should return true for valid provider names', () => {
      expect(isValidProviderType('nvidia')).toBe(true)
      expect(isValidProviderType('openrouter')).toBe(true)
      expect(isValidProviderType('lmstudio')).toBe(true)
      expect(isValidProviderType('llamacpp')).toBe(true)
      expect(isValidProviderType('ollama')).toBe(true)
    })

    it('should return false for invalid provider names', () => {
      expect(isValidProviderType('invalid')).toBe(false)
      expect(isValidProviderType('')).toBe(false)
      expect(isValidProviderType('random')).toBe(false)
      expect(isValidProviderType('nvidia_extra')).toBe(false)
    })
  })

  describe('getProviderByName', () => {
    it('should return a provider for valid nvidia name', () => {
      const provider = getProviderByName(mockEnv, 'nvidia')
      expect(provider).toBeDefined()
      expect(provider.name).toBe('nvidia')
    })

    it('should return a provider for valid openrouter name', () => {
      const provider = getProviderByName(mockEnv, 'openrouter')
      expect(provider).toBeDefined()
      expect(provider.name).toBe('openrouter')
    })

    it('should return a provider for valid lmstudio name', () => {
      const provider = getProviderByName(mockEnv, 'lmstudio')
      expect(provider).toBeDefined()
      expect(provider.name).toBe('lmstudio')
    })

    it('should return a provider for valid llamacpp name', () => {
      const provider = getProviderByName(mockEnv, 'llamacpp')
      expect(provider).toBeDefined()
      expect(provider.name).toBe('llamacpp')
    })

    it('should return a provider for valid ollama name', () => {
      const provider = getProviderByName(mockEnv, 'ollama')
      expect(provider).toBeDefined()
      expect(provider.name).toBe('ollama')
    })

    it('should throw for invalid provider names', () => {
      expect(() => getProviderByName(mockEnv, 'invalid')).toThrow('Unknown provider type: invalid')
    })

    it('should return the same instance for the same provider (singleton)', () => {
      const provider1 = getProviderByName(mockEnv, 'nvidia')
      const provider2 = getProviderByName(mockEnv, 'nvidia')
      expect(provider1).toBe(provider2)
    })
  })
})
