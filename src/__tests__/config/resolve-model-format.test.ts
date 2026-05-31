import { describe, it, expect } from 'vitest'
import { resolveModelFormat, ProviderConfigs } from '../../config/providers'

describe('resolveModelFormat', () => {
  it('should return model-specific format when defined in ModelDefaultsById', () => {
    const config = ProviderConfigs.openrouter
    expect(resolveModelFormat(config, 'owl-alpha')).toBe('anthropic')
    expect(resolveModelFormat(config, 'moonshotai/kimi-k2.6')).toBe('openai')
  })

  it('should fallback to provider config format when no model-specific format', () => {
    const config = ProviderConfigs.nvidia
    expect(resolveModelFormat(config, 'z-ai/glm-5.1')).toBe('openai')
  })

  it('should fallback to provider config format for unknown models', () => {
    const config = ProviderConfigs.openrouter
    expect(resolveModelFormat(config, 'unknown-model')).toBe('anthropic')
  })

  it('should return openai format for NVIDIA models', () => {
    const config = ProviderConfigs.nvidia
    expect(resolveModelFormat(config, 'deepseek/deepseek-v4-pro')).toBe('openai')
  })

  it('should return anthropic format for claude provider', () => {
    const config = ProviderConfigs.claude
    expect(resolveModelFormat(config, 'claude-opus-4-7')).toBe('anthropic')
  })
})
