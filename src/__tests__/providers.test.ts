import { describe, it, expect } from 'vitest'
import { ProviderConfigs, resolveModel, createModelsList, resolveAnthropicModel } from '../config/providers'

describe('Provider Configs', () => {
  describe('resolveModel', () => {
    const openaiConfig = ProviderConfigs.nvidia

    it('should resolve an alias to the full model ID', () => {
      const result = resolveModel(openaiConfig, 'z-ai/glm5.1')
      expect(result).toBe('z-ai/glm-5.1')
    })

    it('should return the full model ID if already full', () => {
      const result = resolveModel(openaiConfig, 'z-ai/glm-5.1')
      expect(result).toBe('z-ai/glm-5.1')
    })

    it('should throw an error for an unsupported model alias', () => {
      expect(() => resolveModel(openaiConfig, 'nonexistent-model')).toThrow(
        /Model alias "nonexistent-model" is not supported/
      )
    })

    it('should resolve the first alias when no model is provided', () => {
      const result = resolveModel(openaiConfig, null)
      const firstAlias = Object.keys(openaiConfig.models)[0]
      expect(result).toBe(openaiConfig.models[firstAlias])
    })

    it('should resolve the first alias when model is undefined', () => {
      const result = resolveModel(openaiConfig, undefined)
      const firstAlias = Object.keys(openaiConfig.models)[0]
      expect(result).toBe(openaiConfig.models[firstAlias])
    })

    it('should resolve claude aliases correctly', () => {
      const claudeConfig = ProviderConfigs.claude
      expect(resolveModel(claudeConfig, 'claude-opus-4-7')).toBe('claude-opus-4-7')
    })

    it('should handle full IDs that are present in values', () => {
      const claudeConfig = ProviderConfigs.claude
      expect(resolveModel(claudeConfig, 'claude-sonnet-4-6')).toBe('claude-sonnet-4-6')
    })
  })

  describe('createModelsList', () => {
    it('should return a list structure for nvidia', () => {
      const list = createModelsList('nvidia')

      expect(list.object).toBe('list')
      expect(Array.isArray(list.data)).toBe(true)
      expect(list.data.length).toBeGreaterThan(0)

      const firstModel = list.data[0]
      expect(firstModel).toHaveProperty('id')
      expect(firstModel).toHaveProperty('object', 'model')
      expect(firstModel).toHaveProperty('created', 0)
      expect(firstModel).toHaveProperty('owned_by')
    })

    it('should return a list structure for claude', () => {
      const list = createModelsList('claude')
      expect(list.object).toBe('list')
      expect(Array.isArray(list.data)).toBe(true)
    })

    it('should filter out aliases that are already the full ID', () => {
      const list = createModelsList('nvidia')

      // The aliases list filters entries where id === resolvedId
      for (const item of list.data) {
        expect(item.id).not.toBe(item.owned_by)
      }
    })

    it('should set owned_by from the resolved model prefix', () => {
      const list = createModelsList('nvidia')

      const firstModel = list.data[0]
      expect(typeof firstModel.owned_by).toBe('string')
      expect(firstModel.owned_by.length).toBeGreaterThan(0)
    })
  })

  describe('ProviderConfigs structure', () => {
    it('should have nvidia config with endpoint and models', () => {
      expect(ProviderConfigs.nvidia).toBeDefined()
      expect(ProviderConfigs.nvidia.endpoint).toBe('/chat/completions')
      expect(ProviderConfigs.nvidia.format).toBe('openai')
      expect(Object.keys(ProviderConfigs.nvidia.models).length).toBeGreaterThan(0)
    })

    it('should have claude config with endpoint and models', () => {
      expect(ProviderConfigs.claude).toBeDefined()
      expect(ProviderConfigs.claude.endpoint).toBe('/messages')
      expect(ProviderConfigs.claude.format).toBe('anthropic')
    })

    it('should have google config', () => {
      expect(ProviderConfigs.google).toBeDefined()
      expect(ProviderConfigs.google.endpoint).toBe('/chat/completions')
    })
  })

  describe('resolveAnthropicModel', () => {
    it('should map opus to ANTHROPIC_OPUS_MODEL', () => {
      const env = {
        ANTHROPIC_OPUS_MODEL: 'nvidia/glm5.1',
        ANTHROPIC_SONNET_MODEL: 'nvidia/kimi-k2.6',
        ANTHROPIC_HAIKU_MODEL: 'nvidia/minimax-m2.7',
        ANTHROPIC_DEFAULT_MODEL: 'nvidia/glm-5.1',
      }
      expect(resolveAnthropicModel(env, 'claude-3-opus-20240229')).toBe('nvidia/glm5.1')
      expect(resolveAnthropicModel(env, 'claude-opus')).toBe('nvidia/glm5.1')
    })

    it('should map sonnet to ANTHROPIC_SONNET_MODEL', () => {
      const env = {
        ANTHROPIC_OPUS_MODEL: 'nvidia/glm5.1',
        ANTHROPIC_SONNET_MODEL: 'nvidia/kimi-k2.6',
        ANTHROPIC_HAIKU_MODEL: 'nvidia/minimax-m2.7',
        ANTHROPIC_DEFAULT_MODEL: 'nvidia/glm-5.1',
      }
      expect(resolveAnthropicModel(env, 'claude-3-sonnet-20240229')).toBe('nvidia/kimi-k2.6')
      expect(resolveAnthropicModel(env, 'claude-sonnet')).toBe('nvidia/kimi-k2.6')
    })

    it('should map haiku to ANTHROPIC_HAIKU_MODEL', () => {
      const env = {
        ANTHROPIC_OPUS_MODEL: 'nvidia/glm5.1',
        ANTHROPIC_SONNET_MODEL: 'nvidia/kimi-k2.6',
        ANTHROPIC_HAIKU_MODEL: 'nvidia/minimax-m2.7',
        ANTHROPIC_DEFAULT_MODEL: 'nvidia/glm-5.1',
      }
      expect(resolveAnthropicModel(env, 'claude-3-haiku-20240229')).toBe('nvidia/minimax-m2.7')
      expect(resolveAnthropicModel(env, 'claude-haiku')).toBe('nvidia/minimax-m2.7')
    })

    it('should fallback to ANTHROPIC_DEFAULT_MODEL for unknown model', () => {
      const env = {
        ANTHROPIC_OPUS_MODEL: 'nvidia/glm5.1',
        ANTHROPIC_SONNET_MODEL: 'nvidia/kimi-k2.6',
        ANTHROPIC_HAIKU_MODEL: 'nvidia/minimax-m2.7',
        ANTHROPIC_DEFAULT_MODEL: 'nvidia/glm-5.1',
      }
      expect(resolveAnthropicModel(env, 'some-random-model')).toBe('nvidia/glm-5.1')
    })

    it('should fallback to original model if no env vars are set', () => {
      const env = {}
      expect(resolveAnthropicModel(env, 'claude-3-opus')).toBe('claude-3-opus')
      expect(resolveAnthropicModel(env, 'some-model')).toBe('some-model')
    })

    it('should be case-insensitive', () => {
      const env = {
        ANTHROPIC_OPUS_MODEL: 'nvidia/glm5.1',
        ANTHROPIC_SONNET_MODEL: 'nvidia/kimi-k2.6',
        ANTHROPIC_HAIKU_MODEL: 'nvidia/minimax-m2.7',
        ANTHROPIC_DEFAULT_MODEL: 'nvidia/glm-5.1',
      }
      expect(resolveAnthropicModel(env, 'CLAUDE-3-OPUS')).toBe('nvidia/glm5.1')
      expect(resolveAnthropicModel(env, 'Claude-Sonnet')).toBe('nvidia/kimi-k2.6')
      expect(resolveAnthropicModel(env, 'Haiku')).toBe('nvidia/minimax-m2.7')
    })
  })
})
