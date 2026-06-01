import { describe, it, expect } from 'vitest'
import { resolveModelFormat } from '../../config/providers'

describe('resolveModelFormat', () => {
  it('should return model-specific format when defined in ModelDefaultsById', () => {
    expect(resolveModelFormat('openrouter', 'owl-alpha')).toBe('anthropic')
    expect(resolveModelFormat('nvidia', 'moonshotai/kimi-k2.6')).toBe('openai')
  })

  it('should fallback to provider default format when no model-specific format', () => {
    expect(resolveModelFormat('nvidia', 'z-ai/glm-5.1')).toBe('openai')
  })

  it('should fallback to provider default format for unknown models', () => {
    expect(resolveModelFormat('openrouter', 'unknown-model')).toBe('anthropic')
  })

  it('should return openai format for NVIDIA models', () => {
    expect(resolveModelFormat('nvidia', 'deepseek/deepseek-v4-pro')).toBe('openai')
  })

  it('should return anthropic format for claude provider', () => {
    expect(resolveModelFormat('claude', 'claude-opus-4-7')).toBe('anthropic')
  })
})
