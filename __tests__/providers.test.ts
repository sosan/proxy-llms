import { describe, it, expect } from 'vitest'
import { ProviderConfigs, resolveModel, createModelsList } from '../config/providers'

describe('Provider Configs', () => {
  describe('resolveModel', () => {
    const openaiConfig = ProviderConfigs.openai

    it('should resolve an alias to the full model ID', () => {
      const result = resolveModel(openaiConfig, 'glm5.1')
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
      expect(resolveModel(claudeConfig, 'claude-3.5-sonnet')).toBe('anthropic/claude-3.5-sonnet-20240620')
    })

    it('should handle full IDs that are present in values', () => {
      const claudeConfig = ProviderConfigs.claude
      expect(resolveModel(claudeConfig, 'anthropic/claude-3-opus-20240229')).toBe('anthropic/claude-3-opus-20240229')
    })
  })

  describe('createModelsList', () => {
    it('should return a list structure for openai', () => {
      const list = createModelsList('openai')
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
      const list = createModelsList('openai')
      // The aliases list filters entries where id === resolvedId
      for (const item of list.data) {
        expect(item.id).not.toBe(item.owned_by)
      }
    })

    it('should set owned_by from the resolved model prefix', () => {
      const list = createModelsList('openai')
      const firstModel = list.data[0]
      expect(typeof firstModel.owned_by).toBe('string')
      expect(firstModel.owned_by.length).toBeGreaterThan(0)
    })
  })

  describe('ProviderConfigs structure', () => {
    it('should have openai config with endpoint and models', () => {
      expect(ProviderConfigs.openai).toBeDefined()
      expect(ProviderConfigs.openai.endpoint).toBe('/chat/completions')
      expect(ProviderConfigs.openai.format).toBe('openai')
      expect(Object.keys(ProviderConfigs.openai.models).length).toBeGreaterThan(0)
    })

    it('should have claude config with endpoint and models', () => {
      expect(ProviderConfigs.claude).toBeDefined()
      expect(ProviderConfigs.claude.endpoint).toBe('/messages')
      expect(ProviderConfigs.claude.format).toBe('anthropic')
    })

    it('should have deepseek config', () => {
      expect(ProviderConfigs.deepseek).toBeDefined()
      expect(ProviderConfigs.deepseek.endpoint).toBe('/chat/completions')
    })

    it('should have google config', () => {
      expect(ProviderConfigs.google).toBeDefined()
      expect(ProviderConfigs.google.endpoint).toBe('/chat/completions')
    })
  })
})
